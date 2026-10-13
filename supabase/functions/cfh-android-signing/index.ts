import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0';
const repo='GoodNames18/Cashflow-Hub';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const {payload}=await jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:'cfh-android-signing',algorithms:['RS256']});
  if(payload.repository!==repo||String(payload.repository_id)!=='1341531600'||payload.repository_owner!=='GoodNames18'||payload.ref!=='refs/heads/Haeo!'||
   !['push','workflow_dispatch'].includes(String(payload.event_name))||
   payload.workflow_ref!==repo+'/.github/workflows/android-apk.yml@refs/heads/Haeo!')return json({error:'Unauthorized build'},401);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data,error}=await admin.rpc('cfh_android_release_signing');
  if(error||!data)return json({error:'Signing key unavailable'},503);
  return json(data);
 }catch{return json({error:'Unauthorized build'},401);}
});
