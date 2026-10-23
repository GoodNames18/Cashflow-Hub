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
 if(note.body)parts.push({type:'text',text:note.body+(audio.length&&!note.body.endsWith('\n')?'\n':'')});
 audio.forEach((m,i)=>{if(i)parts.push({type:'text',text:'\n'});parts.push({type:'audio',id:m.id});});
 if(note.bodyAfter)parts.push({type:'text',text:(audio.length?' ':'')+note.bodyAfter});
 return normalizeNoteContent(parts,note.attachments);
}
export function contentText(parts){return parts.map(p=>p.type==='text'?p.text:'').join('');}
// Preserve browser-created paragraph breaks, but do not read player labels.
export function readNoteContent(host){
 const out=[];const text=value=>{if(value)out.push({type:'text',text:value});};
 const block=node=>node?.nodeType===1&&/^(DIV|P|LI)$/.test(node.tagName)&&!node.dataset?.audioId;
 function children(parent){
  const nodes=[...parent.childNodes];
  // A solitary BR inside an empty browser paragraph is a caret placeholder.
  if(parent!==host&&block(parent)&&nodes.length===1&&nodes[0].tagName==='BR')return;
  nodes.forEach((node,i)=>{if(i&&(block(node)||block(nodes[i-1])))text('\n');walk(node);});
 }
 function walk(node){
  if(node.nodeType===3){text(node.nodeValue);return;}
  if(node.nodeType!==1)return;
  if(node.dataset?.audioId){out.push({type:'audio',id:node.dataset.audioId});return;}
  if(node.tagName==='BR'){text('\n');return;}
  children(node);
 }
 children(host);return out;
}
