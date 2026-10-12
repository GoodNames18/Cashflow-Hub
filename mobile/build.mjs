import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('www',{recursive:true,force:true});await mkdir('www',{recursive:true});
for(const file of ['cashflow-hub-logo.png','gcash-logo.png','maya-logo.png','icon-192.png','icon-512.png','images'])await cp(file,'www/'+file,{recursive:true});
await cp('supabase','www/supabase',{recursive:true,filter:path=>!path.includes('/functions')&&!path.includes('/tests')&&!path.endsWith('.sql')&&!path.endsWith('.gs')});
let html=await readFile('index.html','utf8');
html=html.replace('<head>','<head><script>window.CFH_NATIVE=true;</script>');
html=html.replaceAll('"/Cashflow-Hub/','"/').replaceAll("'/Cashflow-Hub/","'/");
// Android loads bundled assets, never a remote website with a privileged bridge.
html=html.replaceAll('if ("serviceWorker" in navigator)', 'if (!window.CFH_NATIVE && "serviceWorker" in navigator)');
html=html.replace('</body>','<script src="native.js"></script></body>');
await writeFile('www/index.html',html);
await build({entryPoints:['mobile/native.js'],bundle:true,outfile:'www/native.js',format:'iife',target:'es2022'});
