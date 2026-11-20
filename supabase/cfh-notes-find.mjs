import {findNoteMatches,nameTotals} from './cfh-notes-tools.mjs';
import {noteContent,applyNoteFormat} from './cfh-notes-content.mjs';
import {noteMathResults} from './cfh-notes-math.mjs';

// Read-only search presentation: editable DOM and saved note data stay intact.
export function createNoteFind(editor,{getNote,saveNote,closePanels,loadMedia}){
 let session=null;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const style=node('style');style.textContent=`
 #cfhNotesEditorBox .cfh-note-find-bar{display:flex;flex-wrap:wrap;align-items:center;gap:3px;padding:8px;background:var(--cfh-note-background,#fff);color:#1b1844}
 #cfhNotesEditorBox .cfh-note-find-bar input{box-sizing:border-box;flex:1;min-width:0;width:0;padding:10px;border:2px solid #00ad8a;border-radius:10px;background:#ffffff66;font:16px Arial;color:inherit}
 #cfhNotesEditorBox .cfh-note-find-bar button{flex:0 0 34px;width:34px;min-width:0;margin:0;padding:5px;border:0;border-radius:8px;background:transparent;color:inherit;font:26px/1.2 Arial;cursor:pointer}
 #cfhNotesEditorBox .cfh-note-find-bar button:disabled{opacity:.3}
 .cfh-note-find-bar small{font:11px/1.4 Arial;max-width:52px}
 .cfh-note-find-bar .cfh-note-find-sync{flex:0 0 100%;max-width:none;text-align:right;color:#514a65}
 .cfh-note-find-mirror{font:16px/24px Arial;color:#1b1844;white-space:pre-wrap;overflow-wrap:anywhere}
 .cfh-note-find-mirror h2{font:700 26px/1.4 Arial;margin:0 0 20px}
 .cfh-note-find-row{display:flex;align-items:baseline;gap:10px;min-height:40px;padding:7px 0}
 .cfh-note-find-row>input{flex:0 0 20px;width:20px;height:20px;pointer-events:none}
 .cfh-note-find-row-text{flex:1;min-width:0}.cfh-note-find-row.is-checked .cfh-note-find-row-text{text-decoration:line-through}
 .cfh-note-find-total{font:11px/1.5 Arial;color:#007b61;white-space:nowrap}
 .cfh-note-find-mirror mark{background:#ffe46c;color:#1b1844}.cfh-note-find-mirror mark.is-current{background:#ffc14d;outline:1px solid #a96d00}
 .cfh-note-find-mirror img{display:block;max-width:100%;height:auto;border-radius:12px;margin:8px 0}
 .cfh-note-find-mirror audio{max-width:100%;vertical-align:middle}
 .cfh-note-find-completed{font:13px Arial;color:#514a65;margin:16px 0 8px}
 #cfhNotesEditorBox .cfh-note-editor-toolbar[hidden]{display:none}
 `;document.head.append(style);
 function close(){
  if(!session)return false;
  const old=session;session=null;old.observer?.disconnect();
  for(const [element,hidden]of old.hidden)element.hidden=hidden;
  old.bar.querySelector('input')?.blur();old.mirror.remove();old.bar.remove();old.toolbar.hidden=old.toolbarHidden;old.area.scrollTop=old.scroll;
  for(const url of old.urls.values())if(typeof url==='string')URL.revokeObjectURL(url);
  return true;
 }
 function open(){
  if(!getNote()||!saveNote())return false;close();closePanels();
  const note=structuredClone(getNote()),area=editor.querySelector('.cfh-note-editor-content'),toolbar=editor.querySelector('.cfh-note-editor-toolbar');
  const hidden=[...area.children].map(element=>[element,element.hidden]),scroll=area.scrollTop,toolbarHidden=toolbar.hidden;
  for(const [element]of hidden)element.hidden=true;toolbar.hidden=true;
  const mirror=node('div','cfh-note-find-mirror'),bar=node('div','cfh-note-find-bar'),input=node('input'),status=node('small');
  input.type='search';input.placeholder='Find in note';input.setAttribute('aria-label','Find in note');input.enterKeyHint='search';status.setAttribute('role','status');
  const s={area,toolbar,toolbarHidden,hidden,scroll,mirror,bar,urls:new Map()};session=s;
  const sync=node('small','cfh-note-find-sync'),sourceStatus=editor.querySelector('#cfhNotesEditorStatus');sync.setAttribute('role','status');
  function syncStatus(){const value=sourceStatus?.textContent||'';sync.textContent=/^Sync(?: pending|ing|ed)/.test(value)?value:'';sync.hidden=!sync.textContent;}
  syncStatus();const Observer=document.defaultView?.MutationObserver;
  if(sourceStatus&&Observer){s.observer=new Observer(syncStatus);s.observer.observe(sourceStatus,{childList:true,characterData:true,subtree:true});}
  let matches=[],marks=new Map(),index=0;
  const completed=item=>item.checked&&!item.divider&&(!item.pinned||item.pinInCompleted);
  const pending=(note.items||[]).filter(item=>!completed(item)),checked=(note.items||[]).filter(completed);
  const searchNote={...note,items:[...pending,...checked]};
  function media(attachment,tag){
   const element=node(tag);if(tag==='img')element.alt=attachment.name||'Note image';else element.controls=true;
   let value=s.urls.get(attachment.id);
   if(!value){
    value=Promise.resolve().then(()=>loadMedia(attachment.id)).then(blob=>{
     if(!blob||session!==s)return null;const url=URL.createObjectURL(blob);s.urls.set(attachment.id,url);return url;
    }).catch(()=>null);s.urls.set(attachment.id,value);
   }
   Promise.resolve(value).then(url=>{if(url&&session===s&&element.isConnected)element.src=url;});return element;
  }
  function appendText(host,text,fieldMatches,base=0,format,math=[]){
   const cuts=new Set([0,text.length]);
   for(const m of fieldMatches){cuts.add(Math.max(0,Math.min(text.length,m.start-base)));cuts.add(Math.max(0,Math.min(text.length,m.start+m.length-base)));}
   const results=math.filter(r=>r.offset>base&&r.offset<=base+text.length);
   for(const r of results)cuts.add(r.offset-base);
   const ordered=[...cuts].sort((a,b)=>a-b);
   for(let i=1;i<ordered.length;i++){
    const start=ordered[i-1],end=ordered[i];if(start===end)continue;
    const span=node('span','',text.slice(start,end));if(format)applyNoteFormat(span,format);
    const match=fieldMatches.find(m=>m.start<=base+start&&m.start+m.length>=base+end);
    if(match){const mark=node('mark');mark.dataset.matchIndex=String(match.index);mark.append(span);host.append(mark);const group=marks.get(match.index)||[];group.push(mark);marks.set(match.index,group);}else host.append(span);
    for(const result of results.filter(r=>r.offset===base+end)){const answer=node('strong','', ' '+result.text);answer.style.color='#087959';host.append(answer);}
   }
  }
  function highlight(){
   for(const [key,nodes]of marks)for(const mark of nodes)mark.classList.toggle('is-current',key===index);
   status.textContent=matches.length?(index+1)+' / '+matches.length:input.value.trim()?'No matches':'';
   previous.disabled=next.disabled=!matches.length;
   const first=marks.get(index)?.[0];
   if(first){const a=area.getBoundingClientRect(),r=first.getBoundingClientRect();area.scrollTo({top:area.scrollTop+r.top-a.top-Math.max(0,(area.clientHeight-r.height)/2),behavior:'smooth'});}
  }
  function draw(){
   matches=findNoteMatches(searchNote,input.value).map((m,index)=>({...m,index}));index=0;marks=new Map();mirror.replaceChildren();
   const title=node('h2');appendText(title,note.title||'',matches.filter(m=>m.type==='title'));mirror.append(title);
   for(const attachment of note.attachments||[])if(attachment.type==='image')mirror.append(media(attachment,'img'));
   if(note.kind==='list'){
    const totals=nameTotals(note.items);
    function row(item){
     const line=node('div','cfh-note-find-row'+(item.checked?' is-checked':'')),check=node('input'),text=node('div','cfh-note-find-row-text');
     check.type='checkbox';check.checked=!!item.checked;check.disabled=true;check.tabIndex=-1;check.setAttribute('aria-label',item.checked?'Checked item':'Unchecked item');
     appendText(text,item.text||'',matches.filter(m=>m.type==='item'&&m.id===item.id),0,item.format);line.append(check,text);
     if(totals.has(item.id))line.append(node('span','cfh-note-find-total',totals.get(item.id)));mirror.append(line);
    }
    pending.forEach(row);
    if(checked.length){mirror.append(node('p','cfh-note-find-completed',checked.length+' checked items'));if(note.checkedExpanded!==false||matches.some(m=>checked.some(item=>item.id===m.id)))checked.forEach(row);}
   }else{
    const body=node('div'),parts=noteContent(note),text=parts.map(p=>p.type==='text'?p.text:'').join(''),math=noteMathResults(text);let offset=0;
    const bodyMatches=matches.filter(m=>m.type==='body');
    for(const part of parts){if(part.type==='text'){appendText(body,part.text,bodyMatches,offset,part.format,math);offset+=part.text.length;}else{const attachment=(note.attachments||[]).find(m=>m.id===part.id);if(attachment)body.append(media(attachment,'audio'));}}mirror.append(body);
   }
   highlight();
  }
  function control(label,text,action){const b=node('button','',text);b.type='button';b.setAttribute('aria-label',label);b.onclick=action;b.onpointerdown=e=>e.preventDefault();return b;}
  const previous=control('Previous match','⌃',()=>{if(matches.length){index=(index+matches.length-1)%matches.length;highlight();}}),next=control('Next match','⌄',()=>{if(matches.length){index=(index+1)%matches.length;highlight();}}),exit=control('Close find in note','×',close);
  bar.append(input,status,previous,next,exit,sync);area.append(mirror);toolbar.before(bar);
  input.oninput=draw;input.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Enter'){e.preventDefault();(e.shiftKey?previous:next).click();}};
  draw();input.focus({preventScroll:true});return true;
 }
 return {open,close};
}
