import {createChecklist} from './cfh-notes-checklist.mjs';
import {startRecordingWave} from './cfh-notes-wave.mjs';
import {noteContent,normalizeNoteContent,contentText} from './cfh-notes-content.mjs';
import {createNoteFlow} from './cfh-notes-editor.mjs';
import {noteMatches,compareNotes,changeNoteState,checklistFromText,removeLabel,customNoteIds,reorderVisibleNotes} from './cfh-notes-model.mjs';
const KEY='cfh_notes_v1',$=id=>document.getElementById(id),uid=()=>crypto.randomUUID();
let drag=null,ignoreNoteClickUntil=0;
let createdInEditor=false,activeId=null,draft=null,saveTimer,filter='all',view='grid',sort='custom',selectedColor='yellow',toastTimer,lockedY=0,bodyStyle=null;
const colors={white:'#ffffff',yellow:'#fff5c2',mint:'#d8f6e9',lavender:'#e9e6fa',rose:'#ffe1e4',blue:'#dcedff'};
const paths={camera:'M3 7h4l2-3h6l2 3h4v14H3ZM8 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0',pin:'M9 3h6l-1 6 3 4v2H7v-2l3-4ZM12 15v7',unarchive:'M3 4h18v4H3ZM5 8v13h14V8M12 18v-7m-3 3 3-3 3 3',listView:'M3 4h18v6H3ZM3 14h18v6H3Z',gridView:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',close:'M5 5l14 14M19 5L5 19',notes:'M9 21h6M10 17h4M8.5 14.2a7 7 0 1 1 7 0c-.8.6-1.2 1.3-1.4 2.8H9.9c-.2-1.5-.6-2.2-1.4-2.8Z',reminders:'M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3ZM10 21h4',label:'M3 5h11l7 7-7 7H3Z',add:'M12 4v16M4 12h16',archive:'M3 4h18v4H3ZM5 8v13h14V8M12 10v7m-3-3 3 3 3-3',deleted:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',settings:'m10 3 4 0 1 3 3 1 3 3-2 3v3l-3 2-1 3h-5l-1-3-3-1-2-4 2-2V7l4-1ZM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',help:'M12 17v.1M9 9a3 3 0 1 1 5 2l-2 2v1M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',image:'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M7 7h.1',drawing:'m4 16 12-12 4 4L8 20l-5 1ZM14 6l4 4',audio:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',list:'M3 3h18v18H3ZM7 12l3 3 7-7',text:'M3 5h12M9 5v15M15 12h7M18.5 12v8'};
function svg(name){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('aria-hidden','true');const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.notes);n.append(p);return n;}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn,cls=''){const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;}
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(n=>n&&typeof n==='object'&&typeof n.id==='string'):[];}catch{return[];}}
function write(items){try{localStorage.setItem(KEY,JSON.stringify(items));$('cfhNotesEditorStatus').textContent='Saved on this device';return true;}catch{$('cfhNotesEditorStatus').textContent='Could not save. Free device storage and try again.';toast('Could not save. Your changes are still open.');return false;}}
function prefs(){try{localStorage.setItem(KEY+':view',JSON.stringify({view,sort}));}catch{}}
try{const p=JSON.parse(localStorage.getItem(KEY+':view')||'{}');view=p.view==='list'?'list':'grid';sort=['custom','updated','created'].includes(p.sort)?p.sort:'custom';}catch{}
function labels(){try{const list=JSON.parse(localStorage.getItem(KEY+':labels')||'null');if(Array.isArray(list))return list.filter(l=>typeof l.id==='string'&&typeof l.name==='string');}catch{}return[{id:'banks',name:'Banks'},{id:'house',name:'House'}];}
function saveLabels(list){try{localStorage.setItem(KEY+':labels',JSON.stringify(list));return true;}catch{toast('Could not save labels.');return false;}}
function toast(text){$('cfhNotesToast').textContent=text;$('cfhNotesToast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('cfhNotesToast').hidden=true,3500);}
function lock(){if(bodyStyle!==null)return;lockedY=window.scrollY;bodyStyle=document.body.getAttribute('style')||'';Object.assign(document.body.style,{position:'fixed',top:-lockedY+'px',width:'100%',overflow:'hidden'});}
function unlock(){if(['cfhNotesDrawer','cfhNotesCreateMenu','cfhNotesUtility','cfhNotesDrawing','cfhNotesRecording','cfhNotesImageViewer','cfhNotesSortMenu'].some(id=>$(id).open)||!$('cfhNotesEditor').hidden)return;if(bodyStyle!==null){document.body.setAttribute('style',bodyStyle);bodyStyle=null;window.scrollTo(0,lockedY);}}
function showDialog(id){lock();$(id).showModal();}
function outsideClose(d){d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});d.addEventListener('close',unlock);}
for(const id of ['cfhNotesDrawer','cfhNotesCreateMenu','cfhNotesUtility','cfhNotesSortMenu'])outsideClose($(id));
function filterNotes(value){filter=value;$('cfhNotesDrawer').close();render();}
function drawer(){const host=$('cfhNotesDrawerItems');host.replaceChildren();function row(label,icon,value){const b=button('',()=>filterNotes(value),'cfh-notes-drawer-row');b.append(svg(icon),el('span','',label));if(filter===value)b.setAttribute('aria-current','page');host.append(b);}
 row('Notes','notes','all');row('Reminders','reminders','reminders');host.append(el('hr'));const heading=el('div','cfh-notes-label-heading');heading.append(el('span','','Labels'),button('Edit',editLabels));host.append(heading);for(const label of labels())row(label.name,'label','label:'+label.id);const add=button('',()=>editLabels(true),'cfh-notes-drawer-row');add.append(svg('add'),el('span','','Create new label'));host.append(add,el('hr'));row('Archive','archive','archive');row('Deleted','deleted','deleted');for(const [text,icon,fn]of [['Settings','settings',settings],['Help & feedback','help',help]]){const b=button('',fn,'cfh-notes-drawer-row');b.append(svg(icon),el('span','',text));host.append(b);}showDialog('cfhNotesDrawer');$('cfhNotesMenuButton').setAttribute('aria-expanded','true');}
function menus(which){const menu=$('cfhNotesSortMenu');if(which==='sort'){cancelDrag();if(menu.open)menu.close();else{syncSortChoices();showDialog('cfhNotesSortMenu');$('cfhNotesSortButton').setAttribute('aria-expanded','true');}return;}if(menu.open)menu.close();if(which==='menu')drawer();}
function manualIds(notes=read()){
 let saved;try{saved=JSON.parse(localStorage.getItem(KEY+':order')||'null');}catch{}
 if(!Array.isArray(saved)){
  saved=notes.slice().sort((a,b)=>compareNotes(a,b,'updated')).map(n=>n.id);
  try{localStorage.setItem(KEY+':order',JSON.stringify(saved));}catch{}
 }
 return customNoteIds(notes,saved);
}
function syncSortChoices(){
 $('cfhNotesSort').value=sort;
 for(const button of document.querySelectorAll('[data-note-sort]'))button.setAttribute('aria-checked',String(button.dataset.noteSort===sort));
}
$('cfhNotesSortMenu').addEventListener('close',()=>{$('cfhNotesSortButton').setAttribute('aria-expanded','false');$('cfhNotesSortButton').focus({preventScroll:true});});
function saveManualOrder(ids){
 try{localStorage.setItem(KEY+':order',JSON.stringify(reorderVisibleNotes(manualIds(),ids)));return true;}
 catch{toast('Order could not be saved. Free device storage and try again.');return false;}
}
function sameGroup(card){return [...card.parentElement.children].filter(n=>n.dataset.noteId&&n.dataset.pinned===card.dataset.pinned);}
function keyboardMove(card,direction){
 const group=sameGroup(card),ids=group.map(n=>n.dataset.noteId),from=ids.indexOf(card.dataset.noteId),to=from+direction;
 if(to<0||to>=ids.length)return;ids.splice(to,0,ids.splice(from,1)[0]);
 if(saveManualOrder(ids)){const id=card.dataset.noteId;render();[...$('cfhNotesList').querySelectorAll('[data-note-id]')].find(n=>n.dataset.noteId===id)?.focus({preventScroll:true});}
}
function cancelDrag(){
 if(!drag)return;const old=drag;drag=null;clearTimeout(old.timer);if(old.frame)cancelAnimationFrame(old.frame);old.ghost?.remove();old.card.classList.remove('cfh-note-drag-placeholder');old.card.removeAttribute('aria-grabbed');document.body.classList.remove('cfh-note-dragging');
}
function finishDrag(commit){
 if(!drag)return;const active=drag.active,ids=active?sameGroup(drag.card).map(n=>n.dataset.noteId):[];cancelDrag();
 if(active){ignoreNoteClickUntil=Date.now()+500;if(commit)saveManualOrder(ids);render();}
}
function placeDraggedNote(x,y){
 if(!drag?.active)return;drag.x=x;drag.y=y;drag.ghost.style.left=(x-drag.offsetX)+'px';drag.ghost.style.top=(y-drag.offsetY)+'px';
 const target=document.elementFromPoint(x,y)?.closest('[data-note-id]');
 if(!target||target===drag.card||target.parentElement!==drag.grid||target.dataset.pinned!==drag.card.dataset.pinned)return;
 const rect=target.getBoundingClientRect(),list=drag.grid.classList.contains('is-list');
 const before=list?y<rect.top+rect.height/2:x<rect.left+rect.width/2;
 if(before){if(drag.card.nextElementSibling!==target)drag.grid.insertBefore(drag.card,target);}
 else if(target.nextElementSibling!==drag.card)drag.grid.insertBefore(drag.card,target.nextElementSibling);
}
function beginNoteDrag(){
 if(!drag||sort!=='custom'||!drag.card.isConnected)return;const rect=drag.card.getBoundingClientRect();drag.active=true;
 drag.offsetX=drag.startX-rect.left;drag.offsetY=drag.startY-rect.top;drag.grid=drag.card.parentElement;
 drag.ghost=drag.card.cloneNode(true);drag.ghost.classList.add('cfh-note-drag-ghost');drag.ghost.removeAttribute('tabindex');drag.ghost.setAttribute('aria-hidden','true');
 Object.assign(drag.ghost.style,{width:rect.width+'px',height:rect.height+'px',left:rect.left+'px',top:rect.top+'px'});
 for(const control of drag.ghost.querySelectorAll('button,input,audio'))control.tabIndex=-1;
 document.body.append(drag.ghost);drag.card.classList.add('cfh-note-drag-placeholder');drag.card.setAttribute('aria-grabbed','true');document.body.classList.add('cfh-note-dragging');ignoreNoteClickUntil=Date.now()+500;
 const scroll=()=>{if(!drag?.active)return;const height=window.innerHeight,edge=65,dy=drag.y<edge?-Math.ceil((edge-drag.y)/5):drag.y>height-edge?Math.ceil((drag.y-height+edge)/5):0;
  if(dy){window.scrollBy(0,Math.max(-18,Math.min(18,dy)));placeDraggedNote(drag.x,drag.y);}drag.frame=requestAnimationFrame(scroll);};
 drag.frame=requestAnimationFrame(scroll);
}
function armNoteDrag(card,x,y,type){
 if(sort!=='custom')return;cancelDrag();drag={card,startX:x,startY:y,x,y,type,active:false};drag.timer=setTimeout(beginNoteDrag,350);
}
function moveNoteDrag(x,y){
 if(!drag)return;if(!drag.active){if(Math.hypot(x-drag.startX,y-drag.startY)>8)cancelDrag();return;}placeDraggedNote(x,y);
}
function bindNoteDrag(card){
 card.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');
 card.addEventListener('touchstart',e=>{if(e.touches.length!==1){finishDrag(false);return;}if(e.target.closest('button,input,audio'))return;const t=e.touches[0];armNoteDrag(card,t.clientX,t.clientY,'touch');},{passive:true});
 card.addEventListener('touchmove',e=>{if(!drag||drag.card!==card||drag.type!=='touch')return;if(e.touches.length!==1){finishDrag(false);return;}if(drag.active&&e.cancelable)e.preventDefault();const t=e.touches[0];moveNoteDrag(t.clientX,t.clientY);},{passive:false});
 card.addEventListener('touchend',e=>{if(drag?.card!==card||drag.type!=='touch')return;if(drag.active&&e.cancelable)e.preventDefault();finishDrag(true);},{passive:false});
 card.addEventListener('touchcancel',()=>{if(drag?.card===card)finishDrag(false);});
 card.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||e.target.closest('button,input,audio'))return;armNoteDrag(card,e.clientX,e.clientY,'pointer');});
 card.addEventListener('contextmenu',e=>{if(sort==='custom')e.preventDefault();});
}
window.addEventListener('pointermove',e=>{if(drag?.type==='pointer'){if(drag.active)e.preventDefault();moveNoteDrag(e.clientX,e.clientY);}},{passive:false});
window.addEventListener('pointerup',()=>{if(drag?.type==='pointer')finishDrag(true);});
window.addEventListener('pointercancel',()=>{if(drag?.type==='pointer')finishDrag(false);});
window.addEventListener('blur',()=>finishDrag(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDrag(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();finishDrag(false);}});

function utility(title){$('cfhNotesDrawer').close();$('cfhNotesUtilityTitle').textContent=title;$('cfhNotesUtilityBody').replaceChildren();showDialog('cfhNotesUtility');return $('cfhNotesUtilityBody');}
function editLabels(create=false){const host=utility('Labels');const form=el('form'),input=el('input');input.placeholder='New label';input.maxLength=60;input.required=true;const add=button('Create',()=>form.requestSubmit());form.append(input,add);form.onsubmit=e=>{e.preventDefault();const name=input.value.trim(),list=labels();if(!name)return;if(list.some(l=>l.name.toLowerCase()===name.toLowerCase())){toast('That label already exists.');return;}if(saveLabels([...list,{id:uid(),name}]))editLabels(true);};host.append(form);for(const label of labels()){const row=el('div','cfh-notes-label-edit'),text=el('input');text.value=label.name;text.maxLength=60;text.setAttribute('aria-label','Label name');row.append(text,button('Save',()=>{const name=text.value.trim();if(!name)return;if(labels().some(l=>l.id!==label.id&&l.name.toLowerCase()===name.toLowerCase())){toast('That label already exists.');return;}saveLabels(labels().map(l=>l.id===label.id?{...l,name}:l));render();}),button('×',()=>{if(!confirm('Remove this label? Notes will be kept.'))return;if(!write(removeLabel(read(),label.id)))return;if(saveLabels(labels().filter(l=>l.id!==label.id))){if(filter==='label:'+label.id)filter='all';editLabels();render();}}));host.append(row);}if(create)input.focus();}
function settings(){const host=utility('Notes settings');host.append(el('p','','Notes and attachments are saved on this device. They are independent from Google Keep and do not sync across devices.'));host.append(el('p','','Reminder dates appear in the app. Notes notification delivery is not enabled yet.'));host.append(button('Switch list / grid',()=>{view=view==='grid'?'list':'grid';prefs();render();toast(view==='grid'?'Grid view':'List view');}));}
function help(){const host=utility('Notes help');for(const t of ['Use the note button to create text, a checklist, an image attachment, a drawing or an audio attachment.','Notes save as you type. Pin important notes, choose a color, assign a label or set a reminder date.','Archived notes are kept separately. Deleted notes stay in Deleted until you restore or permanently delete them.','To report a problem, share the app version and a screenshot in your Cashflow Hub chat.'])host.append(el('p','',t));}
function reminderText(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';}
function render(){cancelDrag();const host=$('cfhNotesList');if(!host)return;host.replaceChildren();const q=$('cfhNotesSearch').value.trim(),all=read(),positions=new Map(manualIds(all).map((id,i)=>[id,i])),matches=all.filter(n=>noteMatches(n,filter,q)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(sort==='custom'?positions.get(a.id)-positions.get(b.id):compareNotes(a,b,sort)));syncSortChoices();host.classList.toggle('is-custom-order',sort==='custom');$('cfhNotesLayout').setAttribute('aria-label',view==='grid'?'Switch to list view':'Switch to grid view');$('cfhNotesLayout').setAttribute('aria-pressed',String(view==='list'));$('cfhNotesLayout').replaceChildren(svg(view==='grid'?'listView':'gridView'));
 if(!matches.length){host.append(el('p','cfh-notes-empty',q?'No matching notes.':filter==='deleted'?'No deleted notes.':filter==='archive'?'No archived notes.':filter==='reminders'?'Notes with reminder dates appear here.':'Your notes will appear here. Tap the note button to start.'));return;}
 const section=(label,items)=>{if(!items.length)return;host.append(el('div','cfh-notes-section-title',label));const grid=el('div','cfh-notes-grid'+(view==='list'?' is-list':''));for(const n of items){const card=el('article','cfh-note-card');card.tabIndex=0;card.role='button';card.setAttribute('aria-label','Open note '+(n.title||'Untitled'));card.style.background=colors[n.color]||colors.white;card.dataset.noteId=n.id;card.dataset.pinned=String(!!n.pinned);bindNoteDrag(card);card.onclick=e=>{if(Date.now()<ignoreNoteClickUntil)return;if(!e.target.closest('button,input,audio'))open(n.id);};card.onkeydown=e=>{if(e.target===card&&sort==='custom'&&e.altKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();keyboardMove(card,['ArrowUp','ArrowLeft'].includes(e.key)?-1:1);return;}if(e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();open(n.id);}};const top=el('div','cfh-note-card-top');if(n.title)top.append(el('h3','',n.title));if(n.pinned)top.append(button('📌',()=>{const items=read(),i=items.findIndex(x=>x.id===n.id);if(i>=0){items[i]={...items[i],pinned:false};if(write(items))render();}},'cfh-note-pin'));card.append(top);
 if(n.attachments?.length){const media=n.attachments[0];if(media.type==='image'){const img=el('img','cfh-note-media-preview');img.alt='Note image';loadMedia(media.id).then(blob=>{if(blob&&img.isConnected){const u=URL.createObjectURL(blob);img.src=u;img.onload=()=>URL.revokeObjectURL(u);}}).catch(()=>{});card.append(img);}else card.append(el('p','cfh-note-media-label','Audio attachment'));}
 if(n.kind==='list'){for(const item of (n.items||[]).slice(0,7)){const line=el('div','cfh-note-check-row'+(item.checked?' is-checked':'')),check=el('input');check.type='checkbox';check.checked=!!item.checked;check.setAttribute('aria-label',item.text);check.disabled=!!n.deletedAt;check.onchange=()=>{const items=read(),note=items.find(x=>x.id===n.id);if(note){note.items=note.items.map(i=>i.id===item.id?{...i,checked:check.checked}:i);note.updatedAt=Date.now();if(write(items))render();}};line.append(check,el('span','',item.text));card.append(line);}}else if(n.body)card.append(el('p','',n.body));
 if(n.bodyAfter)card.append(el('p','',n.bodyAfter));
 const label=labels().find(l=>l.id===n.labelId);if(label)card.append(el('span','cfh-note-tag',label.name));if(n.reminder)card.append(el('span','cfh-note-reminder'+(new Date(n.reminder).getTime()<=Date.now()?' is-due':''),'◷ '+reminderText(n.reminder)));card.append(el('small','',new Date(n.updatedAt||n.createdAt||Date.now()).toLocaleDateString()));grid.append(card);}host.append(grid);};
 if(filter==='all'){section('Pinned',matches.filter(n=>n.pinned));section('Notes',matches.filter(n=>!n.pinned));}else section(filter==='archive'?'Archive':filter==='deleted'?'Deleted':filter==='reminders'?'Reminders':labels().find(l=>'label:'+l.id===filter)?.name||'Notes',matches);
}
function saveDraft(){if(!draft)return true;captureNoteFlow();draft.title=$('cfhNotesTitle').value;draft.body=$('cfhNotesBody').value;draft.bodyAfter=$('cfhNotesBodyAfter').value;draft.labelId=$('cfhNotesLabel').value;draft.reminder=$('cfhNotesReminder').value;draft.color=selectedColor;if(!draft.title.trim()&&!draft.body.trim()&&!draft.bodyAfter.trim()&&!draft.items?.some(i=>i.text.trim())&&!draft.attachments?.length&&createdInEditor){if(activeId&&!write(read().filter(n=>n.id!==activeId)))return false;activeId=null;$('cfhNotesDelete').hidden=true;return true;}const items=read(),now=Date.now();if(!activeId){activeId=draft.id;draft.createdAt=now;}draft.updatedAt=now;const i=items.findIndex(n=>n.id===activeId);if(i>=0)items[i]={...draft};else items.push({...draft});if(!write(items))return false;$('cfhNotesDelete').hidden=false;render();return true;}
const noteFlow=createNoteFlow($('cfhNotesAudioAttachments'),{changed:()=>scheduleSave()});
const checklist=createChecklist($('cfhNotesChecklist'),$('cfhNotesAddItem'),{changed:()=>scheduleSave(),id:uid});
function captureNoteFlow(){
 const host=$('cfhNotesAudioAttachments');
 if(!draft||draft.kind==='list'||host.dataset.noteId!==draft.id)return;
 draft.content=noteFlow.read(draft.attachments||[]);
 draft.body=contentText(draft.content);draft.bodyAfter='';
 $('cfhNotesBody').value=draft.body;$('cfhNotesBodyAfter').value='';
}
function fitNoteBody(){
 if($('cfhNotesEditor').hidden)return;
 const host=$('cfhNotesAudioAttachments'),width=host.clientWidth||host.getBoundingClientRect().width;
 const ctx=document.createElement('canvas').getContext?.('2d');if(ctx)ctx.font='16px Arial';
 for(const player of host.querySelectorAll('[data-audio-id]')){
  const next=player.nextSibling,word=next?.nodeType===3?next.nodeValue.replace(/\u200b/g,'').trimStart().split(/\s/)[0]:'';
  const wordWidth=word?(ctx?ctx.measureText(word).width:word.length*8):0;
  player.style.width=width&&(!word||wordWidth+226>width)?'100%':'220px';
 }
 host.dataset.empty=String(!host.querySelector('[data-audio-id]')&&!host.textContent.replace(/\u200b/g,'').length);
}
window.addEventListener('resize',fitNoteBody);
$('cfhNotesEditorBox').querySelector('.cfh-note-editor-content').addEventListener('click',event=>{
 if($('cfhNotesEditor').hidden||!draft||draft.kind==='list')return;
 if(event.target===event.currentTarget||event.target===$('cfhNotesDescriptionFlow'))noteFlow.focusEnd();
});
function scheduleSave(){fitNoteBody();clearTimeout(saveTimer);$('cfhNotesEditorStatus').textContent='Saving…';saveDraft();}
function open(id,kind='text'){const n=id?read().find(x=>x.id===id):null;createdInEditor=!n;activeId=n?.id||null;draft=n?structuredClone(n):{id:uid(),kind,items:[],attachments:[],pinned:false,color:'white',createdAt:Date.now()};selectedColor=draft.color||'white';$('cfhNotesTitle').value=draft.title||'';$('cfhNotesBody').value=draft.body||'';$('cfhNotesBodyAfter').value=draft.bodyAfter||'';const select=$('cfhNotesLabel');select.replaceChildren(new Option('No label',''),...labels().map(l=>new Option(l.name,l.id)));select.value=draft.labelId||'';$('cfhNotesReminder').value=draft.reminder||'';$('cfhNotesEditor').hidden=false;requestAnimationFrame(fitNoteBody);document.body.classList.add('cfh-notes-editor-open');editorPanel();syncEditorViewport();lock();paint();renderChecklist();renderAttachments();$('cfhNotesDelete').hidden=!n;$('cfhNotesDelete').textContent=draft.deletedAt?'Delete permanently':'Delete';$('cfhNotesRestore').hidden=!draft.deletedAt;$('cfhNotesArchive').hidden=!!draft.deletedAt;$('cfhNotesArchive').replaceChildren(svg(draft.archived?'unarchive':'archive'));$('cfhNotesArchive').setAttribute('aria-label',draft.archived?'Unarchive note':'Archive note');$('cfhNotesEditorStatus').textContent='Saved on this device';$('cfhNotesPinButton').setAttribute('aria-pressed',String(!!draft.pinned));$('cfhNotesPinButton').replaceChildren(svg('pin'));$('cfhNotesPinButton').setAttribute('aria-label',draft.pinned?'Unpin note':'Pin note');if(!id)setTimeout(()=>$('cfhNotesTitle').focus(),50);}
function paint(){$('cfhNotesEditorBox').style.background=colors[selectedColor]||'white';$('cfhNotesEditorBox').style.setProperty('--cfh-note-background',colors[selectedColor]||'#ffffff');document.querySelectorAll('.cfh-note-color').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.noteColor===selectedColor)));}
function renderChecklist(){
 const isList=draft?.kind==='list';$('cfhNotesBody').hidden=true;$('cfhNotesBodyAfter').hidden=true;
 $('cfhNotesAudioAttachments').setAttribute('contenteditable',String(!isList));
 $('cfhNotesChecklistMode').textContent=isList?'Use text note':'Use checklist';checklist.render(draft);
 if(!isList)requestAnimationFrame(fitNoteBody);
}
function addItem(){checklist.add();}
function close(){checklist.cancelMove();noteFlow.cancelMove();clearTimeout(saveTimer);if(!saveDraft())return false;$('cfhNotesEditor').hidden=true;document.body.classList.remove('cfh-notes-editor-open');editorPanel();document.activeElement?.blur();for(const n of $('cfhNotesEditorBox').querySelectorAll('.cfh-note-editor-content [data-media-url]')){if(n.tagName==='AUDIO')n.pause();URL.revokeObjectURL(n.dataset.mediaUrl);}draft=null;activeId=null;unlock();render();return true;}
function pin(){if(!draft)return;draft.pinned=!draft.pinned;$('cfhNotesPinButton').replaceChildren(svg('pin'));$('cfhNotesPinButton').setAttribute('aria-label',draft.pinned?'Unpin note':'Pin note');$('cfhNotesPinButton').setAttribute('aria-pressed',String(draft.pinned));saveDraft();}
function color(c){if(colors[c]){selectedColor=c;paint();saveDraft();}}
function stateAction(action){checklist.cancelMove();noteFlow.cancelMove();clearTimeout(saveTimer);if(!saveDraft()||!activeId)return;const items=read(),i=items.findIndex(n=>n.id===activeId);if(i<0)return;if(action==='permanent'){if(!confirm('Permanently delete this note? This cannot be undone.'))return;const media=items[i].attachments||[];items.splice(i,1);if(!write(items))return;for(const attachment of media)deleteMedia(attachment.id).catch(()=>{});}else{items[i]=changeNoteState(items[i],action);if(!write(items))return;}$('cfhNotesEditor').hidden=true;document.body.classList.remove('cfh-notes-editor-open');editorPanel();document.activeElement?.blur();for(const n of $('cfhNotesEditorBox').querySelectorAll('.cfh-note-editor-content [data-media-url]')){if(n.tagName==='AUDIO')n.pause();URL.revokeObjectURL(n.dataset.mediaUrl);}draft=null;activeId=null;unlock();render();}
let dbPromise;function db(){return dbPromise||=(new Promise((resolve,reject)=>{const request=indexedDB.open('cfh_notes_media_v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('media');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));}
async function mediaOp(mode,id,value){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('media',mode),store=tx.objectStore('media');const req=value===undefined?(mode==='readonly'?store.get(id):store.delete(id)):store.put(value,id);let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Attachment save failed'));});}
const loadMedia=id=>mediaOp('readonly',id),deleteMedia=id=>mediaOp('readwrite',id);
async function attach(blob,type,name,duration=0){
 const id=uid(),destination=draft?.id;await mediaOp('readwrite',id,blob);
 if(destination&&draft?.id!==destination){deleteMedia(id).catch(()=>{});return;}
 if(!draft){open(null);draft.title=name||'';$('cfhNotesTitle').value=draft.title;}
 captureNoteFlow();draft.content=noteContent(draft);draft.attachments||=[];draft.attachments.push({id,type,name,...(duration>0?{duration}:{})});
 if(type==='audio')draft.content.push({type:'text',text:draft.content.length?'\n':''},{type:'audio',id},{type:'text',text:' '});
 renderAttachments();if(!saveDraft())throw Error('Note could not be saved');
}
function removeAttachment(id){
 if(!draft)return false;captureNoteFlow();const previous=draft.attachments||[],content=draft.content;
 draft.attachments=previous.filter(m=>m.id!==id);draft.content=normalizeNoteContent(noteContent(draft),draft.attachments);renderAttachments();
 if(!saveDraft()){draft.attachments=previous;draft.content=content;renderAttachments();return false;}
 deleteMedia(id).catch(()=>{});return true;
}
function audioPlayer(media,load){
 const wrapper=el('span','cfh-note-audio-bar'),audio=el('audio');audio.hidden=true;audio.preload='metadata';
 wrapper.dataset.audioId=media.id;wrapper.setAttribute('role','group');wrapper.setAttribute('aria-label',media.name||'Audio recording');
 const icon=playing=>{const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('aria-hidden','true');n.innerHTML=playing?'<circle cx="12" cy="12" r="9"/><path d="M9 8v8m6-8v8"/>':'<circle cx="12" cy="12" r="9"/><path fill="currentColor" stroke="none" d="m10 8 6 4-6 4Z"/>';return n;};
 const play=button('',async()=>{try{if(audio.paused!==false||audio.ended){for(const other of $('cfhNotesAudioAttachments').querySelectorAll('audio'))if(other!==audio)other.pause();await audio.play();}else audio.pause();}catch{toast('This audio could not be played.');}},'cfh-note-audio-control');play.setAttribute('aria-label','Play recording');play.replaceChildren(icon(false));
 const progress=el('input','cfh-note-audio-progress');progress.type='range';progress.min='0';progress.max='1000';progress.step='1';progress.value='0';progress.disabled=true;progress.setAttribute('aria-label','Audio playback position');
 const time=seconds=>{const value=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');};
 const duration=()=>Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Number(media.duration)||0;
 const label=el('span','cfh-note-audio-duration',time(duration()));
 const update=()=>{const total=duration(),current=Number(audio.currentTime)||0,playing=audio.paused===false&&!audio.ended;play.replaceChildren(icon(playing));play.setAttribute('aria-label',playing?'Pause recording':'Play recording');play.setAttribute('aria-pressed',String(playing));progress.disabled=!total;progress.value=String(total?Math.min(1000,Math.round(current/total*1000)):0);progress.style.setProperty('--audio-progress',progress.value/10+'%');progress.setAttribute('aria-valuetext',time(current)+' of '+time(total));label.textContent=time(total);};
 progress.oninput=()=>{const total=duration();if(!total)return;try{audio.currentTime=Number(progress.value)/1000*total;update();}catch{toast('Audio is still loading.');}};
 for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])audio.addEventListener(event,update);
 audio.addEventListener('error',()=>{play.setAttribute('aria-label','Retry playing recording');});
 const remove=button('',()=>removeAttachment(media.id),'cfh-note-audio-control');remove.setAttribute('aria-label','Delete recording');remove.title='Delete recording';remove.append(svg('deleted'));
 wrapper.append(play,progress,label,remove,audio);noteFlow.bindAudio(wrapper);void load(media,audio);update();return wrapper;
}
function renderAttachments(){const host=$('cfhNotesAttachments'),audioHost=$('cfhNotesAudioAttachments');for(const n of $('cfhNotesEditorBox').querySelectorAll('.cfh-note-editor-content [data-media-url]')){if(n.tagName==='AUDIO')n.pause();URL.revokeObjectURL(n.dataset.mediaUrl);}host.replaceChildren();audioHost.replaceChildren();const images=(draft.attachments||[]).filter(m=>m.type==='image'),audio=(draft.attachments||[]).filter(m=>m.type==='audio');const load=(media,n)=>loadMedia(media.id).then(blob=>{if(!blob||!n.isConnected)return;const url=URL.createObjectURL(blob);n.src=url;n.dataset.mediaUrl=url;}).catch(()=>toast('Could not load attachment.'));
 if(images.length){const gallery=el('div','cfh-note-image-gallery'+(images.length===1?' is-single':''));let index=0;while(index<images.length){const remaining=images.length-index,count=remaining===1?1:remaining===3?3:2,row=el('div','cfh-note-image-row');row.style.setProperty('--image-columns',String(count));for(const media of images.slice(index,index+count)){const tile=button('',()=>openImage(media.id),'cfh-note-photo'),img=el('img');tile.dataset.mediaId=media.id;tile.setAttribute('aria-label','Open photo '+(images.indexOf(media)+1));img.alt=media.name||'Attached photo';tile.append(img);row.append(tile);void load(media,img);}gallery.append(row);index+=count;}host.append(gallery);}
 const byId=new Map(audio.map(m=>[m.id,m]));
 audioHost.dataset.noteId=draft.id;audioHost.hidden=draft.kind==='list'&&!audio.length;
 const parts=noteContent(draft);draft.content=parts;
 for(const part of parts){if(part.type==='text'){if(draft.kind!=='list')audioHost.append(document.createTextNode(part.text));}else if(byId.has(part.id))audioHost.append(audioPlayer(byId.get(part.id),load));}
 if(draft.kind!=='list')audioHost.append(document.createTextNode('\u200b'));
 fitNoteBody();
}
let viewerMediaId=null,viewerUrl=null,viewerLoad=0;
const viewerImages=()=>draft?.attachments?.filter(m=>m.type==='image')||[];
function releaseViewerImage(){viewerLoad++;if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=null;$('cfhNotesFullImage').removeAttribute('src');}
function openImage(id){document.activeElement?.blur();viewerMediaId=id;$('cfhNotesImageMenu').hidden=true;$('cfhNotesImageMore').setAttribute('aria-expanded','false');if(!$('cfhNotesImageViewer').open)$('cfhNotesImageViewer').showModal();void renderImageViewer();}
async function renderImageViewer(){releaseViewerImage();const token=viewerLoad,images=viewerImages(),index=images.findIndex(m=>m.id===viewerMediaId);if(index<0){$('cfhNotesImageViewer').close();return;}$('cfhNotesImageCount').textContent=(index+1)+' of '+images.length;$('cfhNotesImagePrevious').disabled=index===0;$('cfhNotesImageNext').disabled=index===images.length-1;const img=$('cfhNotesFullImage');img.hidden=true;$('cfhNotesImageStatus').textContent='Loading photo…';try{const blob=await loadMedia(viewerMediaId);if(token!==viewerLoad||!$('cfhNotesImageViewer').open)return;if(!blob)throw Error();viewerUrl=URL.createObjectURL(blob);img.src=viewerUrl;img.alt=images[index].name||'Attached photo';img.hidden=false;$('cfhNotesImageStatus').textContent='';}catch{if(token===viewerLoad)$('cfhNotesImageStatus').textContent='Photo unavailable on this device.';}}
function changeImage(offset){const images=viewerImages(),index=images.findIndex(m=>m.id===viewerMediaId),next=images[index+offset];if(next){viewerMediaId=next.id;void renderImageViewer();}}
$('cfhNotesImageBack').onclick=()=>$('cfhNotesImageViewer').close();$('cfhNotesImagePrevious').onclick=()=>changeImage(-1);$('cfhNotesImageNext').onclick=()=>changeImage(1);
$('cfhNotesImageMore').onclick=()=>{const menu=$('cfhNotesImageMenu');menu.hidden=!menu.hidden;$('cfhNotesImageMore').setAttribute('aria-expanded',String(!menu.hidden));};
$('cfhNotesImageDelete').onclick=()=>{if(!viewerMediaId||!confirm('Delete this photo from the note?'))return;const images=viewerImages(),index=images.findIndex(m=>m.id===viewerMediaId);if(!removeAttachment(viewerMediaId))return;$('cfhNotesImageMenu').hidden=true;$('cfhNotesImageMore').setAttribute('aria-expanded','false');const next=viewerImages();if(!next.length)$('cfhNotesImageViewer').close();else{viewerMediaId=next[Math.min(index,next.length-1)].id;void renderImageViewer();}};
$('cfhNotesImageViewer').addEventListener('close',()=>{releaseViewerImage();viewerMediaId=null;unlock();});
$('cfhNotesImageViewer').addEventListener('cancel',e=>{if(!$('cfhNotesImageMenu').hidden){e.preventDefault();$('cfhNotesImageMenu').hidden=true;$('cfhNotesImageMore').setAttribute('aria-expanded','false');}});
let viewerTouch=null;const imageStage=$('cfhNotesImageViewer').querySelector('.cfh-note-image-stage');imageStage.addEventListener('touchstart',e=>{viewerTouch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});imageStage.addEventListener('touchend',e=>{if(!viewerTouch)return;const touch=e.changedTouches[0],dx=touch.clientX-viewerTouch.x,dy=touch.clientY-viewerTouch.y;viewerTouch=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)changeImage(dx<0?1:-1);},{passive:true});imageStage.addEventListener('touchcancel',()=>viewerTouch=null,{passive:true});

async function imageBlob(file){const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Image could not be saved')),'image/jpeg',.85));}
function syncNotesNavSpace(){const nav=document.querySelector('.cfh-bottom-nav'),height=nav?.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--cfh-notes-nav-space',Math.ceil(height)+'px');}
syncNotesNavSpace();window.addEventListener('resize',syncNotesNavSpace);if(typeof ResizeObserver!=='undefined'){const nav=document.querySelector('.cfh-bottom-nav');if(nav)new ResizeObserver(syncNotesNavSpace).observe(nav);}
function createMenu(){syncNotesNavSpace();document.body.classList.add('cfh-notes-create-open');menus();const menu=$('cfhNotesCreateMenu');showDialog('cfhNotesCreateMenu');$('cfhNotesCreateButton').setAttribute('aria-expanded','true');}
for(const [title,name]of [['Image','image'],['Drawing','drawing'],['Audio','audio'],['List','list'],['Text','text']]){const b=button('',()=>{$('cfhNotesCreateMenu').close();if(name==='image')$('cfhNotesImageFile').click();else if(name==='audio')$('cfhNotesAudioFile').click();else if(name==='drawing')draw();else{open(null,name);if(name==='list')addItem();}},'cfh-notes-create-choice');b.append(svg(name),el('span','',title));$('cfhNotesCreateChoices').append(b);}
$('cfhNotesCreateClose').replaceChildren(svg('close'));
$('cfhNotesCreateMenu').addEventListener('close',()=>{document.body.classList.remove('cfh-notes-create-open');$('cfhNotesCreateButton').setAttribute('aria-expanded','false');});$('cfhNotesCreateClose').onclick=()=>$('cfhNotesCreateMenu').close();
$('cfhNotesImageFile').onchange=async e=>{const files=[...(e.target.files||[])];e.target.value='';if(!files.length)return;if(!draft)open(null);const destination=draft.id;for(const file of files){if(!file.type.startsWith('image/')||file.size>25*1024*1024){toast('Choose images smaller than 25 MB each.');continue;}try{const blob=await imageBlob(file);if(draft?.id!==destination)break;await attach(blob,'image',file.name);}catch{toast('Image could not be saved. Check device storage.');}}};
$('cfhNotesAudioFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!file.type.startsWith('audio/')||file.size>25*1024*1024){toast('Choose an audio file smaller than 25 MB.');return;}try{await attach(file,'audio',file.name);}catch{toast('Audio could not be saved. Check device storage.');}};
const canvas=$('cfhNotesCanvas'),ctx=canvas.getContext('2d');let drawing=false;
function draw(){ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);showDialog('cfhNotesDrawing');}
function point(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];}
canvas.onpointerdown=e=>{e.preventDefault();drawing=true;canvas.setPointerCapture(e.pointerId);const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineWidth=Number($('cfhNotesDrawSize').value);ctx.strokeStyle=$('cfhNotesDrawInk').value;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineTo(x+.1,y+.1);ctx.stroke();};canvas.onpointermove=e=>{if(!drawing)return;e.preventDefault();ctx.lineTo(...point(e));ctx.stroke();};canvas.onpointerup=canvas.onpointercancel=()=>drawing=false;
$('cfhNotesDrawClear').onclick=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);};$('cfhNotesDrawCancel').onclick=()=>$('cfhNotesDrawing').close();$('cfhNotesDrawing').addEventListener('close',unlock);$('cfhNotesDrawSave').onclick=async()=>{const b=$('cfhNotesDrawSave');b.disabled=true;try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error();$('cfhNotesDrawing').close();await attach(blob,'image','Drawing');}catch{toast('Drawing could not be saved.');}finally{b.disabled=false;}};
$('cfhNotesDrawer').addEventListener('close',()=>{$('cfhNotesMenuButton').setAttribute('aria-expanded','false');});
$('cfhNotesUtilityClose').onclick=()=>$('cfhNotesUtility').close();$('cfhNotesAddItem').onclick=addItem;$('cfhNotesChecklistMode').onclick=()=>{captureNoteFlow();if(draft.kind==='list'){draft.body=(draft.items||[]).map(i=>(i.checked?'☑ ':'☐ ')+i.text).join('\n');$('cfhNotesBody').value=draft.body;draft.kind='text';delete draft.content;}else{draft.items=checklistFromText($('cfhNotesBody').value,uid);draft.kind='list';}renderChecklist();renderAttachments();saveDraft();};$('cfhNotesArchive').onclick=()=>stateAction(draft.archived?'unarchive':'archive');$('cfhNotesRestore').onclick=()=>stateAction('restore');
for(const id of ['cfhNotesTitle','cfhNotesBody','cfhNotesBodyAfter','cfhNotesReminder'])$(id).addEventListener('input',scheduleSave);$('cfhNotesLabel').onchange=scheduleSave;
$('cfhNotesEditor').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();if(!closeEditorPanel())close();}});document.addEventListener('click',e=>{if(!e.target.closest('.cfh-notes-head'))menus();});
window.cfhHandleNotesBack=()=>{if(checklist.cancelMove())return true;if(noteFlow.cancelMove())return true;if(drag){cancelDrag();render();return true;}if($('cfhNotesImageViewer').open&&!$('cfhNotesImageMenu').hidden){$('cfhNotesImageMenu').hidden=true;$('cfhNotesImageMore').setAttribute('aria-expanded','false');return true;}for(const id of ['cfhNotesSortMenu','cfhNotesImageViewer','cfhNotesRecording','cfhNotesAttachmentPanel','cfhNotesDrawing','cfhNotesUtility','cfhNotesCreateMenu','cfhNotesDrawer'])if($(id).open){$(id).close();return true;}if(!$('cfhNotesEditor').hidden){if(!closeEditorPanel())close();return true;}return false;};
const editorPanels=['Attachment','Color','Text','More'];
function editorPanel(which){for(const name of editorPanels){const panel=$('cfhNotes'+name+'Panel'),trigger=$('cfhNotes'+name+'Button');panel.hidden=name!==which;if(name==='Attachment'){if(name===which&&!panel.open){document.activeElement?.blur();panel.showModal();}else if(name!==which&&panel.open)panel.close();}trigger.setAttribute('aria-expanded',String(name===which));trigger.setAttribute('aria-controls',panel.id);}}
function closeEditorPanel(){if(!editorPanels.some(name=>!$('cfhNotes'+name+'Panel').hidden))return false;editorPanel();return true;}
function syncEditorViewport(){const viewport=window.visualViewport;if(viewport){$('cfhNotesEditor').style.setProperty('--cfh-note-viewport-height',viewport.height+'px');$('cfhNotesEditor').style.setProperty('--cfh-note-viewport-top',viewport.offsetTop+'px');}}
window.visualViewport?.addEventListener('resize',syncEditorViewport);window.visualViewport?.addEventListener('scroll',syncEditorViewport);window.addEventListener('resize',syncEditorViewport);
for(const name of editorPanels)$('cfhNotes'+name+'Button').onclick=()=>editorPanel($('cfhNotes'+name+'Panel').hidden?name:undefined);
$('cfhNotesBack').onclick=close;$('cfhNotesPinButton').onclick=pin;
const attachSheet=$('cfhNotesAttachmentPanel');outsideClose(attachSheet);attachSheet.addEventListener('close',()=>{attachSheet.hidden=true;$('cfhNotesAttachmentButton').setAttribute('aria-expanded','false');});
for(const choice of document.querySelectorAll('[data-note-attach]')){const type=choice.dataset.noteAttach,text=choice.textContent;choice.replaceChildren(svg(type==='recording'?'audio':type),el('span','',text));choice.onclick=()=>{editorPanel();if(type==='drawing')draw();else if(type==='recording')void startRecording();else if(type==='list'){if(draft.kind!=='list')$('cfhNotesChecklistMode').onclick();if(!draft.items?.length)addItem();}else $(type==='camera'?'cfhNotesCameraFile':'cfhNotesImageFile').click();};}
$('cfhNotesCameraFile').onchange=$('cfhNotesImageFile').onchange;
let stopRecordingWave=null;
let audioRecorder=null,audioStream=null,recordToken=0,recordChunks=[],recordBytes=0,recordTimer=null,recordLimitTimer=null,keepRecording=false,recordStarted=0;
function releaseMicrophone(){stopRecordingWave?.();stopRecordingWave=null;clearInterval(recordTimer);clearTimeout(recordLimitTimer);audioStream?.getTracks().forEach(track=>track.stop());audioStream=null;}
async function startRecording(){const token=++recordToken;keepRecording=false;$('cfhNotesRecordingStatus').textContent='Preparing microphone…';$('cfhNotesRecordingSave').disabled=true;showDialog('cfhNotesRecording');try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Recording is not supported on this device.');const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==recordToken||!$('cfhNotesRecording').open){stream.getTracks().forEach(track=>track.stop());return;}audioStream=stream;recordChunks=[];recordBytes=0;audioRecorder=new MediaRecorder(stream);const recorder=audioRecorder;recorder.ondataavailable=e=>{if(e.data.size){recordChunks.push(e.data);recordBytes+=e.data.size;if(recordBytes>24*1024*1024)stopRecording(true);}};recorder.onstop=async()=>{const save=keepRecording,blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});releaseMicrophone();audioRecorder=null;if(save&&blob.size&&blob.size<=25*1024*1024){try{await attach(blob,'audio','Recording',Math.max(0,(Date.now()-recordStarted)/1000));}catch{toast('Recording could not be saved. Check device storage.');}}else if(save)toast('Recording was empty or too large.');};recorder.onerror=()=>{stopRecording(false);toast('Recording stopped because of a microphone error.');};recorder.start(1000);stopRecordingWave=startRecordingWave($('cfhNotesRecordingWave'),stream);recordStarted=Date.now();recordTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-recordStarted)/1000);$('cfhNotesRecordingStatus').textContent='Recording · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');},500);recordLimitTimer=setTimeout(()=>{toast('Recording reached the 10-minute limit and was saved.');stopRecording(true);},10*60*1000);$('cfhNotesRecordingStatus').textContent='Recording · 0:00';$('cfhNotesRecordingSave').disabled=false;}catch(error){releaseMicrophone();if(token===recordToken){$('cfhNotesRecordingStatus').textContent=error.name==='NotAllowedError'?'Microphone permission was denied. Allow access and try again.':error.message;$('cfhNotesRecordingSave').disabled=true;}}}
function stopRecording(save){keepRecording=save;if(audioRecorder?.state==='recording')audioRecorder.stop();else releaseMicrophone();$('cfhNotesRecording').close();}
$('cfhNotesRecordingSave').onclick=()=>stopRecording(true);$('cfhNotesRecordingCancel').onclick=()=>stopRecording(false);$('cfhNotesRecording').addEventListener('close',()=>{recordToken++;if(audioRecorder?.state==='recording'){keepRecording=false;audioRecorder.stop();}releaseMicrophone();unlock();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audioRecorder?.state==='recording')stopRecording(true);});

Object.assign(window,{cfhNotesMenu:menus,cfhNotesFilter:filterNotes,cfhNotesToggleLayout:()=>{view=view==='grid'?'list':'grid';prefs();render();},cfhNotesSetSort:value=>{if(['custom','updated','created'].includes(value)){sort=value;prefs();menus();render();if(value==='custom')toast('Hold and drag notes to rearrange.');}},cfhNotesRender:render,cfhNotesOpen:open,cfhNotesClose:close,cfhNotesTogglePin:pin,cfhNotesSetColor:color,cfhNotesDelete:()=>stateAction(draft?.deletedAt?'permanent':'delete'),cfhNotesCreateMenu:createMenu});
render();

document.addEventListener('visibilitychange',()=>{if(document.hidden&&draft){clearTimeout(saveTimer);saveDraft();}});window.addEventListener('pagehide',()=>{if(draft)saveDraft();});
