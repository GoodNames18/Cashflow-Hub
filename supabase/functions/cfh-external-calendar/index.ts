import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {createNotificationReader} from "../cfh-push/kernel.ts";
import {apple,google,plusDay,stableId} from "./providers.mjs";

const env=(name:string)=>Deno.env.get(name)||"";
const owner="161ecab1-d1d7-4fef-a089-a7300b9da774";
const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
const origins=new Set(["https://goodnames18.github.io","https://localhost","http://localhost","capacitor://localhost"]);
const appleConfig={calendar:env("CFH_ICLOUD_CALENDAR_URL"),email:env("CFH_ICLOUD_EMAIL"),password:env("CFH_ICLOUD_APP_PASSWORD")};
const googleConfig={calendar:env("CFH_GOOGLE_CALENDAR_ID"),clientId:env("CFH_GOOGLE_CLIENT_ID"),clientSecret:env("CFH_GOOGLE_CLIENT_SECRET"),refresh:env("CFH_GOOGLE_REFRESH_TOKEN")};
const configured={apple:Object.values(appleConfig).every(Boolean),google:Object.values(googleConfig).every(Boolean)};
let pending:Promise<unknown>|undefined;
async function run(){
 const {data,error}=await db.from("cfh_calendar_state").select("storage_key,value").eq("owner_id",owner);
 if(error||!data?.some(row=>row.storage_key==="cfh_card_panel_preferences_v1"&&row.value))throw Error("Saved card settings unavailable");
 const reader=createNotificationReader(Object.fromEntries(data.filter(row=>typeof row.value==="string").map(row=>[row.storage_key,row.value])));
 const now=new Date();
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const stamp=now.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
 const due=new Map();
 for(let i=0;i<90;i++){
  const date=plusDay(today,i);
  for(const entry of reader(date,"export")){
   if(!entry.exportKey)continue;
   const amount=entry.amount;
   due.set(entry.exportKey,{id:await stableId(entry.exportKey),date,title:String(entry.title).slice(0,250),description:typeof amount==="number"&&Number.isFinite(amount)&&amount>=0?"Amount due: "+new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(amount):""});
  }
 }
 const events=[...due.values()];
 const results=await Promise.allSettled([
  configured.apple?apple(appleConfig,events,stamp):null,
  configured.google?google(googleConfig,events):null
 ]);
 return Object.fromEntries(["apple","google"].map((name,i)=>{
  const result=results[i];
  return [name,result.status==="rejected"?{state:"failed"}:result.value===null?{state:"not_connected"}:{state:"synced",changes:result.value}];
 }));
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://goodnames18.github.io","Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const bearer=req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 if(!bearer)return reply({error:"Unauthorized"},401);
 try{
  const {data,error}=await db.auth.getUser(bearer);
  if(error||data.user?.id!==owner)return reply({error:"Unauthorized"},401);
  if(!configured.apple&&!configured.google)return reply({apple:{state:"not_connected"},google:{state:"not_connected"}});
  if(pending)return reply({error:"Calendar sync in progress"},409);
  pending=run();
  try{return reply(await pending);}finally{pending=undefined;}
 }catch{return reply({error:"Calendar sync could not complete"},502);}
});
