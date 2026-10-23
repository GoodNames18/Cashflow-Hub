// Notes store text and audio positions as data, never editable HTML.
export function normalizeNoteContent(parts,attachments=[]){
 const allowed=new Set(attachments.filter(m=>m.type==='audio').map(m=>m.id)),seen=new Set(),out=[];
 for(const part of parts||[]){
  if(part?.type==='text'&&typeof part.text==='string'){
   const text=part.text.replace(/\u200b/g,'');if(!text)continue;
   if(out.at(-1)?.type==='text')out.at(-1).text+=text;else out.push({type:'text',text});
  }else if(part?.type==='audio'&&allowed.has(part.id)&&!seen.has(part.id)){seen.add(part.id);out.push({type:'audio',id:part.id});}
 }
 return out;
}
export function noteContent(note){
 if(Array.isArray(note.content))return normalizeNoteContent(note.content,note.attachments);
 const audio=(note.attachments||[]).filter(m=>m.type==='audio'),parts=[];
 if(note.body)parts.push({type:'text',text:note.body+(audio.length?'\n':'')});
 audio.forEach((m,i)=>{if(i)parts.push({type:'text',text:'\n'});parts.push({type:'audio',id:m.id});});
 if(note.bodyAfter)parts.push({type:'text',text:(audio.length?' ':'')+note.bodyAfter});
 return normalizeNoteContent(parts,note.attachments);
}
export function contentText(parts){return parts.map(p=>p.type==='text'?p.text:'').join('');}
// Preserve browser-created paragraph breaks, but do not read player labels.
export function readNoteContent(host){
 const out=[];const text=value=>{if(value)out.push({type:'text',text:value});};
 function walk(node){
  if(node.nodeType===3){text(node.nodeValue);return;}
  if(node.nodeType!==1)return;
  if(node.dataset?.audioId){out.push({type:'audio',id:node.dataset.audioId});return;}
  if(node.tagName==='BR'){text('\n');return;}
  const block=/^(DIV|P|LI)$/.test(node.tagName);
  if(block&&out.length&&!out.at(-1).text?.endsWith('\n'))text('\n');
  for(const child of node.childNodes)walk(child);
  if(block&&node.nextSibling&&!out.at(-1)?.text?.endsWith('\n'))text('\n');
 }
 for(const child of host.childNodes)walk(child);
 return out;
}
