import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
import {notificationEntries} from "./kernel.ts";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const origin="https://goodnames18.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const hash=async(t:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)))).map(x=>x.toString(16).padStart(2,"0")).join("");
function dayKey(date:Date,zone:string){return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function plusDay(key:string,n:number){const d=new Date(key+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function zonedInstant(key:string,time:string,zone:string){
 const target=Date.parse(key+"T"+time+":00Z");let guess=target;
 for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const represented=Date.parse(p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute+":"+p.second+"Z");guess+=target-represented;}
 return guess;
}
Deno.serve(async req=>{
 try{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const {data:config,error:configError}=await db.from("cfh_push_config").select("*").eq("id",true).single();if(configError)throw configError;
 const action=new URL(req.url).searchParams.get("action");
 if(req.method==="GET"&&action==="config")return reply({publicKey:config.public_key});
 if(action==="dispatch"){
 if(req.method!=="POST"||req.headers.get("authorization")!=="Bearer "+config.dispatch_token)return reply({error:"Unauthorized"},401);
 webpush.setVapidDetails("https://goodnames18.github.io/Cashflow-Hub/",config.public_key,config.private_key);
 const {data:devices,error}=await db.from("cfh_push_devices").select("*");if(error)throw error;
 const now=Date.now(),minute=Math.floor(now/60000)*60000;
 for(const device of devices||[]){
 const today=dayKey(new Date(now),device.timezone);
 for(let offset=0;offset<=7;offset++){
 const date=plusDay(today,offset);
 for(const event of notificationEntries(device.snapshot,date)){
 if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(event.time)||!event.days.includes(offset))continue;
 const due=zonedInstant(today,event.time,device.timezone);
 if(due>minute+59999||due<minute-10*60000)continue;
 const occurrence_key=event.id+"|"+date+"|"+offset+"|"+event.time;
 const payload={title:event.title,body:(offset===0?"Today":offset===1?"Tomorrow":"In "+offset+" days")+" · "+date,tag:occurrence_key,url:"/Cashflow-Hub/?page=calendar",due};
 const result=await db.from("cfh_push_deliveries").upsert({device_hash:device.token_hash,occurrence_key,payload},{onConflict:"device_hash,occurrence_key",ignoreDuplicates:true});if(result.error)throw result.error;
 }
 }
 }
 const {data:pending,error:claimError}=await db.rpc("cfh_claim_push_deliveries");if(claimError)throw claimError;
 let sent=0,failed=0;
 for(const job of pending||[]){
 const device=(devices||[]).find(d=>d.token_hash===job.device_hash);if(!device)continue;
 try{
 await webpush.sendNotification(device.subscription,JSON.stringify(job.payload),{TTL:3600,timeout:10000});
 const r=await db.from("cfh_push_deliveries").update({status:"delivered",delivered_at:new Date().toISOString()}).eq("device_hash",job.device_hash).eq("occurrence_key",job.occurrence_key);if(r.error)throw r.error;sent++;
 }catch(e){
 failed++;if(e.statusCode===404||e.statusCode===410){await db.from("cfh_push_devices").delete().eq("token_hash",job.device_hash);}
 else await db.from("cfh_push_deliveries").update({status:job.attempts>=5?"failed":"pending",retry_at:new Date(now+Math.min(job.attempts*2,30)*60000).toISOString()}).eq("device_hash",job.device_hash).eq("occurrence_key",job.occurrence_key);
 }
 }
 return reply({sent,failed,devices:devices?.length||0});
 }
 if(req.headers.get("origin")!==origin)return reply({error:"Origin not allowed"},403);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");if(!/^[a-f0-9]{64}$/.test(token))return reply({error:"Invalid device token"},401);
 const token_hash=await hash(token);
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(action==="test"){
 const {data:device,error}=await db.from("cfh_push_devices").select("subscription").eq("token_hash",token_hash).single();if(error)return reply({error:"Enable notifications first"},404);
 webpush.setVapidDetails("https://goodnames18.github.io/Cashflow-Hub/",config.public_key,config.private_key);
 await webpush.sendNotification(device.subscription,JSON.stringify({title:"Cashflow Hub",body:"Notifications are working on this device.",tag:"cfh-push-test",url:"/Cashflow-Hub/?page=calendar"}),{TTL:60,timeout:10000});return reply({sent:true});
 }
 if(action==="disable"){const r=await db.from("cfh_push_devices").delete().eq("token_hash",token_hash);if(r.error)throw r.error;return reply({enabled:false});}
 const raw=await req.text();if(raw.length>500000)return reply({error:"Schedule data too large"},413);const body=JSON.parse(raw);
 const url=new URL(body.subscription?.endpoint||"");const host=url.hostname;
 if(url.protocol!=="https:"||url.port||url.username||url.password||!(host==="fcm.googleapis.com"||host.endsWith(".push.services.mozilla.com")||host==="web.push.apple.com"||host.endsWith(".notify.windows.com")))return reply({error:"Unsupported push service"},400);
 if(!body.subscription.keys?.p256dh||!body.subscription.keys?.auth)return reply({error:"Invalid subscription"},400);
 new Intl.DateTimeFormat("en",{timeZone:body.timezone}).format();
 if(!body.snapshot||Object.values(body.snapshot).some(v=>typeof v!=="string"))return reply({error:"Invalid schedules"},400);
 // Validate calendar data before saving the replacement snapshot.
 notificationEntries(body.snapshot,dayKey(new Date(),body.timezone));
 const r=await db.from("cfh_push_devices").upsert({token_hash,subscription:body.subscription,snapshot:body.snapshot,timezone:body.timezone,updated_at:new Date().toISOString()});if(r.error)throw r.error;
 await db.from("cfh_push_deliveries").delete().eq("device_hash",token_hash).eq("status","pending");
 return reply({enabled:true,syncedAt:new Date().toISOString()});
 }catch(e){console.error("CFH push:",e.message);return reply({error:"Notification service could not complete the request"},500);}
});