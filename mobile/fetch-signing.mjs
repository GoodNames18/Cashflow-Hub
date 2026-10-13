// Only trusted GitHub Actions jobs can fetch the encrypted-vault signing material.
import {writeFile,mkdir} from 'node:fs/promises';
const request=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
request.searchParams.set('audience','cfh-android-signing');
const tokenResponse=await fetch(request,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
if(!tokenResponse.ok)throw Error('Could not authenticate this build');
const {value:token}=await tokenResponse.json();
const response=await fetch('https://mssrsogwxvxyyjnavdiu.supabase.co/functions/v1/cfh-android-signing',{method:'POST',headers:{Authorization:'Bearer '+token}});
if(!response.ok)throw Error('Release signing authorization failed: '+response.status);
const material=await response.json();
// Only print the GitHub mask command; never print material or credentials.
console.log('::add-mask::'+material.password);
console.log('::add-mask::'+material.keystore);
const root=process.env.RUNNER_TEMP+'/cfh-release-signing';
await mkdir(root,{recursive:true,mode:0o700});
await writeFile(root+'/release.p12',Buffer.from(material.keystore,'base64'),{mode:0o600});
await writeFile(root+'/signing.properties','storeFile='+root+'/release.p12\nstorePassword='+material.password+'\nkeyAlias='+material.alias+'\nkeyPassword='+material.password+'\n',{mode:0o600});
await writeFile(root+'/expected-cert.sha256',material.certificateSha256+'\n',{mode:0o600});
