import {noteContent,contentText} from './cfh-notes-content.mjs';
const money=new Intl.NumberFormat('en-PH',{maximumFractionDigits:2});
export function parseNameAmount(text){
 const match=/^\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)([km]?)\s+([\p{L}][\p{L} .'’\-]*)\s*$/iu.exec(String(text||''));
 if(!match)return null;
 const amount=Math.round(Number(match[1].replaceAll(',',''))*({k:1000,m:1000000}[match[2].toLowerCase()]||1)*100);
 const name=match[3].trim().replace(/\s+/g,' ');
 return Number.isSafeInteger(amount)?{amount,name,key:name.toLocaleLowerCase('en-PH')}:null;
}
export function nameTotals(items){
 const groups=new Map();
 for(const item of items||[]){if(item.checked||item.divider)continue;const parsed=parseNameAmount(item.text);if(!parsed||parsed.key==='load')continue;
  const group=groups.get(parsed.key)||{cents:0,count:0,item,at:-Infinity};group.cents+=parsed.amount;group.count++;
  const at=Number(item.createdAt)||0;if(at>=group.at){group.item=item;group.at=at;}groups.set(parsed.key,group);
 }
 return new Map([...groups.values()].filter(g=>g.count>1&&Number.isSafeInteger(g.cents)).map(g=>[g.item.id,'Total ₱'+money.format(g.cents/100)]));
}
export function noteShareText(note){
 const totals=nameTotals(note.items),lines=note.kind==='list'?(note.items||[]).filter(i=>!i.checked&&i.text?.trim()).map(i=>i.divider?'────────':i.text+(totals.has(i.id)?' ('+totals.get(i.id)+')':'')):[contentText(noteContent(note))];
 return [note.title,...lines].filter(Boolean).join('\n');
}
export function findNoteMatches(note,query){
 query=String(query).trim().toLocaleLowerCase();if(!query)return [];
 const fields=[{type:'title',text:note.title||''},...(note.kind==='list'?(note.items||[]).map(i=>({type:'item',id:i.id,text:i.text||''})): [{type:'body',text:contentText(noteContent(note))}])];
 const matches=[];for(const field of fields){const value=field.text.toLocaleLowerCase();let start=0;while((start=value.indexOf(query,start))!==-1){matches.push({...field,start,length:query.length});start+=query.length;}}
 return matches;
}
export async function copyNoteData(source,{id,loadMedia,saveMedia,removeMedia,now=Date.now()}){
 const note=structuredClone(source),mediaIds=new Map(),saved=[];
 try{
  for(const media of note.attachments||[]){const blob=await loadMedia(media.id);if(!blob)throw Error('An attachment is unavailable. Connect and try again.');const next=id();await saveMedia(next,blob);saved.push(next);mediaIds.set(media.id,next);media.id=next;}
  note.id=id();note.title=(source.title||'Untitled')+' (copy)';note.createdAt=now;note.updatedAt=now;note.pinned=false;note.archived=false;delete note.deletedAt;delete note.reminder;
  note.items=(note.items||[]).map(item=>({...item,id:id()}));
  if(note.content)note.content=note.content.map(part=>part.type==='audio'?{...part,id:mediaIds.get(part.id)||part.id}:part);
  return note;
 }catch(error){await Promise.allSettled(saved.map(removeMedia));throw error;}
}

export function canRestoreChecklist(note){
 if(note?.kind!=='text'||!note.items?.length)return false;
 const original=note.items.map(item=>(item.checked?'☑ ':'☐ ')+(item.text||'')).join('\n');
 return contentText(noteContent(note)).trim()===original.trim();
}
