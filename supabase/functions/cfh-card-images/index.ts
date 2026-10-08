import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";
const repo="GoodNames18/Cashflow-Hub", bucket="cfh-card-images";
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors={"Access-Control-Allow-Origin":"https://goodnames18.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 try{
  if(req.method==="GET"){
   const {data,error}=await admin.storage.from(bucket).download("catalog.json");
   if(error)return json({images:[]});
   return json(JSON.parse(await data.text()));
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
  try{
   const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:"cfh-card-image-sync"});
   if(payload.repository!==repo||!["refs/heads/Haeo!","refs/heads/feature/calendar"].includes(String(payload.ref))||
    !["push","workflow_dispatch"].includes(String(payload.event_name))||
    !String(payload.job_workflow_ref).startsWith(repo+"/.github/workflows/sync-card-images.yml@refs/heads/"))throw new Error("Unauthorized workflow");
  }catch{return json({error:"Unauthorized"},401);}
  const {data:buckets,error:bucketError}=await admin.storage.listBuckets();if(bucketError)throw bucketError;
  if(!buckets.some(b=>b.id===bucket)){
   const {error}=await admin.storage.createBucket(bucket,{public:true,fileSizeLimit:6291456,allowedMimeTypes:["image/png","image/jpeg","image/webp","image/gif","application/json"]});if(error)throw error;
  }
  const images=new Map<string,unknown>();
  for(const branch of ["Haeo!","feature/calendar"]){
   const response=await fetch("https://api.github.com/repos/"+repo+"/contents/images?ref="+encodeURIComponent(branch),{headers:{"Accept":"application/vnd.github+json","User-Agent":"CFH-card-sync"}});
   if(!response.ok)throw new Error("GitHub listing failed: "+response.status);
   for(const file of await response.json()){
    if(file.type!=="file"||!/\.(png|jpe?g|webp|gif)$/i.test(file.name))continue;
    if(file.size>6291456)throw new Error("Image exceeds 6 MB: "+file.name);
    const object=file.sha+"/"+file.name;
    const mime=/\.png$/i.test(file.name)?"image/png":/\.webp$/i.test(file.name)?"image/webp":/\.gif$/i.test(file.name)?"image/gif":"image/jpeg";
    const {data:existing}=await admin.storage.from(bucket).list(file.sha,{limit:100});
    if(!existing?.some(item=>item.name===file.name)){
     const download=await fetch(file.download_url);if(!download.ok)throw new Error("GitHub image download failed");
     const {error}=await admin.storage.from(bucket).upload(object,await download.arrayBuffer(),{contentType:mime,cacheControl:"31536000",upsert:false});
     if(error)throw error;
    }
    images.set(file.name,{name:file.name.replace(/\.[^.]+$/,""),filename:file.name,url:admin.storage.from(bucket).getPublicUrl(object).data.publicUrl,sha:file.sha});
   }
  }
  const catalog={images:[...images.values()],updatedAt:new Date().toISOString()};
  const {error}=await admin.storage.from(bucket).upload("catalog.json",JSON.stringify(catalog),{contentType:"application/json",cacheControl:"0",upsert:true});if(error)throw error;
  return json(catalog);
 }catch(error){console.error(error);return json({error:"Image synchronization failed"},500);}
});