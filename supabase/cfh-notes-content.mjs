// Notes store text and audio positions as data, never editable HTML.
const formatKeys=['size','b','i','u','s'];
function normalizeFormat(format){
 const size=['h1','h2','body'].includes(format?.size)?format.size:null;
 return Object.fromEntries(formatKeys.flatMap(k=>k==='size'?(size?[[k,size]]:[]):format?.[k]===true?[[k,true]]:[]));
}
export function applyNoteFormat(node,format){
 const f=normalizeFormat(format);
 node.style.fontSize={h1:'1.65em',h2:'1.3em',body:'1em'}[f.size]||'';
 node.style.fontWeight=f.b||f.size==='h1'||f.size==='h2'?'700':'';
 node.style.fontStyle=f.i?'italic':'';
 node.style.textDecorationLine=[f.u?'underline':'',f.s?'line-through':''].filter(Boolean).join(' ');
}
export function makeNoteText(part){
 const text=document.createTextNode(part.text);
 if(!part.format)return text;
 let node=text;
 for(const [key,tag] of [['b','b'],['i','i'],['u','u'],['s','strike']]){
  if(part.format[key]){const wrapper=document.createElement(tag);wrapper.append(node);node=wrapper;}
 }
 if(part.format.size){
  const font=document.createElement('font');
  font.size={h1:'6',h2:'5',body:'3'}[part.format.size];
  font.append(node);node=font;
 }
 return node;
}
export function normalizeNoteContent(parts,attachments=[]){
 const allowed=new Set(attachments.filter(m=>m.type==='audio').map(m=>m.id)),seen=new Set(),out=[];
 for(const part of parts||[]){
  if(part?.type==='text'&&typeof part.text==='string'){
   const text=part.text.replace(/\u200b/g,'');if(!text)continue;
   const format=normalizeFormat(part.format),hasFormat=Object.keys(format).length>0,previous=out.at(-1);
   if(previous?.type==='text'&&JSON.stringify(previous.format||{})===JSON.stringify(format))previous.text+=text;
   else out.push({type:'text',text,...(hasFormat?{format}:{})});
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
export function readNoteContent(host,onText){
 const out=[];let offset=0;const text=(value,node,format)=>{if(value){if(node)onText?.(node,offset);out.push({type:'text',text:value,...(format&&Object.keys(format).length?{format}:{})});offset+=value.length;}};
 const block=node=>node?.nodeType===1&&/^(DIV|P|LI)$/.test(node.tagName)&&!node.dataset?.audioId;
 function children(parent,format){
  const nodes=[...parent.childNodes].filter(node=>!node.hasAttribute?.('data-note-math-result'));
  // A solitary BR inside an empty browser paragraph is a caret placeholder.
  if(parent!==host&&block(parent)&&nodes.length===1&&nodes[0].tagName==='BR')return;
  nodes.forEach((node,i)=>{if(i&&(block(node)||block(nodes[i-1])))text('\n');walk(node,format);});
 }
 function walk(node,format){
  if(node.nodeType===3){text(node.nodeValue,node,format);return;}
  if(node.nodeType!==1)return;
  if(node.hasAttribute?.('data-note-math-result'))return;
  if(node.dataset?.audioId){out.push({type:'audio',id:node.dataset.audioId});return;}
  if(node.tagName==='BR'){text('\n');return;}
  const next={...format};
  const mark={B:'b',STRONG:'b',I:'i',EM:'i',U:'u',S:'s',STRIKE:'s',DEL:'s'}[node.tagName];
  if(mark)next[mark]=true;
  if(node.tagName==='FONT'){
   const size={'6':'h1','5':'h2','3':'body'}[node.getAttribute('size')];
   if(size)next.size=size;
  }
  children(node,next);
 }
 children(host,{});return out;
}
