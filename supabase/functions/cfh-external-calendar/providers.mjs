const prefix='cfhdue';
export const stableId=async key=>prefix+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function plusDay(key,n=1){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[,;]/g,'\\$&');
const utf8=new TextEncoder();
function fold(line){let count=0,out='';for(const c of line){const n=utf8.encode(c).length;if(count+n>75){out+='\r\n ';count=1;}count+=n;out+=c;}return out;}
export function appleEvent(event,stamp){
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Cashflow Hub//Card Due Dates//EN','BEGIN:VEVENT','UID:'+event.id+'@cashflowhub','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+event.date.replaceAll('-',''),'DTEND;VALUE=DATE:'+plusDay(event.date).replaceAll('-',''),'SUMMARY:'+escape(event.title),'DESCRIPTION:'+escape(event.description),'TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export function plan(events,remote){
 const local=new Map(events.map(event=>[event.id,event]));
 return {remove:[...remote.keys()].filter(id=>!local.has(id)),write:events.filter(event=>remote.get(event.id)!==JSON.stringify(event))};
}
export const ownedId=id=>typeof id==='string'&&/^cfhdue[0-9a-f]{64}$/.test(id);
export function appleURL(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||!/^(?:p[0-9]+-)?caldav\.icloud\.com$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/'))throw Error('Invalid iCloud calendar URL');
 return u;
}
export async function request(url,options={},allowed=[]){
 const res=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(9000)});
 if(!res.ok&&!allowed.includes(res.status))throw Error('Provider request failed ('+res.status+')');
 return res;
}
export async function google(config,events){
 const token=await (await request('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refresh,grant_type:'refresh_token'})})).json();
 if(!token.access_token)throw Error('Google authorization failed');
 const headers={authorization:'Bearer '+token.access_token,'content-type':'application/json'};
 const root='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(config.calendar)+'/events';
 const remote=new Map();let page;
 do{
  const query=new URLSearchParams({privateExtendedProperty:'managedBy=cashflowhub-card-due',maxResults:'2500'});
  if(page)query.set('pageToken',page);
  const result=await (await request(root+'?'+query,{headers})).json();
  for(const e of result.items??[])if(ownedId(e.id))remote.set(e.id,JSON.stringify({id:e.id,date:e.start?.date,title:e.summary,description:e.description??''}));
  page=result.nextPageToken;
 }while(page);
 const changes=plan(events,remote);
 await batches(changes.write,async e=>{
  const body=JSON.stringify({id:e.id,summary:e.title,description:e.description,start:{date:e.date},end:{date:plusDay(e.date)},transparency:'transparent',reminders:{useDefault:false},extendedProperties:{private:{managedBy:'cashflowhub-card-due'}}});
  const result=await request(root+(remote.has(e.id)?'/'+e.id:''),{method:remote.has(e.id)?'PUT':'POST',headers,body},[409]);
  if(result.status===409){
   const existing=await (await request(root+'/'+e.id,{headers})).json();
   if(existing.status!=='cancelled'&&existing.extendedProperties?.private?.managedBy!=='cashflowhub-card-due')throw Error('Google event ID already exists');
   await request(root+'/'+e.id,{method:'PUT',headers,body:JSON.stringify({...JSON.parse(body),status:'confirmed'})});
  }
 });
 await batches(changes.remove,id=>request(root+'/'+id,{method:'DELETE',headers},[404,410]));
 return changes.write.length+changes.remove.length;
}
async function batches(items,action){for(let i=0;i<items.length;i+=5)await Promise.all(items.slice(i,i+5).map(action));}
export async function apple(config,events,stamp){
 const root=appleURL(config.calendar);
 const headers={authorization:'Basic '+btoa(config.email+':'+config.password)};
 const response=await request(root,{method:'REPORT',headers:{...headers,Depth:'1','content-type':'application/xml; charset=utf-8'},body:'<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:prop-filter name="UID"><c:text-match>cfhdue</c:text-match></c:prop-filter></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>'});
 const xml=await response.text(), remote=new Map();
 if(!/<(?:[\w.-]+:)?multistatus(?:\s|>)/i.test(xml))throw Error('Unexpected iCloud calendar response');
 const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,entity=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.slice(1,-1)]??String.fromCodePoint(entity[2]==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1)))));
 const field=(part,name)=>part.match(new RegExp('<(?:[\\w.-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?'+name+'>','i'))?.[1];
 for(const item of xml.split(/<(?:[\w.-]+:)?response(?:\s[^>]*)?>/i).slice(1)){
  const href=field(item,'href'),raw=field(item,'calendar-data'),etag=field(item,'getetag');
  if(!href)continue;
  const url=new URL(decode(href),root),file=url.pathname.slice(root.pathname.length);
  if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)||!file.endsWith('.ics'))continue;
  const id=file.slice(0,-4);
  if(!ownedId(id))continue;
  if(!raw||!etag)throw Error('Incomplete iCloud event response');
  const data=decode(raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1')).replace(/\r?\n[ \t]/g,'').replace(/\r?\n/g,'\r\n');
  if(!data.includes('UID:'+id+'@cashflowhub'))throw Error('iCloud event ID is already in use');
  remote.set(id,{data,etag:decode(etag)});
 }
 const normalize=s=>s.split('\r\n').filter(line=>/^(DTSTART;|DTEND;|SUMMARY:|DESCRIPTION:)/.test(line)).sort().join('\n');
 const local=new Set(events.map(e=>e.id));let count=0;
 await batches(events,async e=>{
  const body=appleEvent(e,stamp),old=remote.get(e.id);
  if(old&&normalize(old.data)===normalize(body.replace(/\r\n /g,'')))return;
  await request(new URL(e.id+'.ics',root),{method:'PUT',headers:{...headers,'content-type':'text/calendar; charset=utf-8',...(old?{'If-Match':old.etag}:{'If-None-Match':'*'})},body});count++;
 });
 await batches([...remote].filter(([id])=>!local.has(id)),async ([id,old])=>{await request(new URL(id+'.ics',root),{method:'DELETE',headers:{...headers,'If-Match':old.etag}},[404]);count++;});
 return count;
}
