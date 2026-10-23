import {reorderVisibleNotes} from './cfh-notes-model.mjs';

export function createChecklist(host,addButton,{changed,id}){
 let note=null,moving=null;
 addButton.replaceChildren();const plus=document.createElement('span');plus.textContent='＋';plus.setAttribute('aria-hidden','true');const addLabel=document.createElement('span');addLabel.textContent='List item';addButton.append(plus,addLabel);addButton.setAttribute('aria-label','Add list item');
 const rowFor=item=>[...host.querySelectorAll('[data-check-id]')].find(row=>row.dataset.checkId===item.id);
 function fit(field){const area=host.closest('.cfh-note-editor-content'),y=area?.scrollTop;field.style.height='0px';field.style.height=Math.max(24,field.scrollHeight)+'px';if(area)area.scrollTop=y;}
 function focusItem(item,end=true){const field=rowFor(item)?.querySelector('textarea');if(!field)return;field.focus();const at=end?field.value.length:0;field.setSelectionRange?.(at,at);}
 function cancelMove(){
  if(!moving)return false;const old=moving;moving=null;if(old.frame)cancelAnimationFrame(old.frame);
  old.ghost?.remove();old.row.classList.remove('is-moving');return true;
 }
 function finishMove(commit){
  if(!moving)return;const {active,group}=moving,ids=active?[...group.children].map(n=>n.dataset.checkId):[];
  cancelMove();if(!active)return;
  if(commit){const map=new Map(note.items.map(item=>[item.id,item]));note.items=reorderVisibleNotes(note.items.map(item=>item.id),ids).map(key=>map.get(key));changed();}
  render(note);
 }
 function place(x,y){
  if(!moving)return;
  if(!moving.active&&Math.hypot(x-moving.x,y-moving.y)<5)return;
  if(!moving.active){moving.active=true;moving.row.classList.add('is-moving');moving.ghost=moving.row.cloneNode(true);moving.ghost.classList.add('cfh-check-drag-ghost');moving.ghost.removeAttribute('data-check-id');moving.ghost.querySelector('textarea').value=moving.row.querySelector('textarea').value;moving.ghost.setAttribute('aria-hidden','true');moving.ghost.style.width=moving.row.getBoundingClientRect().width+'px';document.body.append(moving.ghost);}
  moving.lastX=x;moving.lastY=y;moving.ghost.style.left=(x+10)+'px';moving.ghost.style.top=(y-15)+'px';
  const target=document.elementFromPoint(x,y)?.closest('[data-check-id]');
  if(!target||target===moving.row||target.parentElement!==moving.group)return;
  const r=target.getBoundingClientRect();if(y<r.top+r.height/2)moving.group.insertBefore(moving.row,target);else moving.group.insertBefore(moving.row,target.nextSibling);
 }
 function bindGrip(grip,row){
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();cancelMove();moving={row,group:row.parentElement,pointer:e.pointerId,x:e.clientX,y:e.clientY};grip.setPointerCapture?.(e.pointerId);
   const scroll=()=>{if(!moving)return;if(moving.active){const area=host.closest('.cfh-note-editor-content'),r=area.getBoundingClientRect(),y=moving.lastY,dy=y<r.top+35?-10:y>r.bottom-35?10:0;if(dy){area.scrollTop+=dy;place(moving.lastX,moving.lastY);}}moving.frame=requestAnimationFrame(scroll);};moving.frame=requestAnimationFrame(scroll);
  });
  grip.addEventListener('pointermove',e=>{if(moving?.pointer===e.pointerId){e.preventDefault();place(e.clientX,e.clientY);}});
  grip.addEventListener('pointerup',e=>{if(moving?.pointer===e.pointerId){e.preventDefault();finishMove(true);}});
  grip.addEventListener('pointercancel',()=>finishMove(false));grip.addEventListener('lostpointercapture',()=>finishMove(false));grip.addEventListener('contextmenu',e=>e.preventDefault());
  grip.addEventListener('keydown',e=>{
   if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
   const rows=[...row.parentElement.children],from=rows.indexOf(row),to=from+(e.key==='ArrowUp'?-1:1);if(to<0||to>=rows.length)return;
   const ids=rows.map(r=>r.dataset.checkId);ids.splice(to,0,ids.splice(from,1)[0]);const map=new Map(note.items.map(item=>[item.id,item]));note.items=reorderVisibleNotes(note.items.map(item=>item.id),ids).map(key=>map.get(key));changed();const key=row.dataset.checkId;render(note);rowFor({id:key})?.querySelector('.cfh-check-grip')?.focus();
  });
 }
 function makeRow(item){
  const row=document.createElement('div');row.className='cfh-note-check-row'+(item.checked?' is-checked':'');row.dataset.checkId=item.id;
  const grip=document.createElement(item.checked?'span':'button');grip.className='cfh-check-grip';
  if(!item.checked){grip.type='button';grip.setAttribute('aria-label','Move list item');grip.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');grip.innerHTML='<svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';bindGrip(grip,row);}else grip.setAttribute('aria-hidden','true');
  const check=document.createElement('input');check.type='checkbox';check.checked=!!item.checked;check.setAttribute('aria-label',(item.checked?'Uncheck ':'Complete ')+(item.text||'item'));
  const text=document.createElement('textarea');text.rows=1;text.maxLength=1000;text.placeholder='List item';text.setAttribute('aria-label','List item');text.value=item.text||'';
  check.onchange=()=>{item.checked=check.checked;changed();render(note);rowFor(item)?.querySelector('input')?.focus({preventScroll:true});};
  text.oninput=()=>{item.text=text.value;check.setAttribute('aria-label',(item.checked?'Uncheck ':'Complete ')+(item.text||'item'));fit(text);changed();};
  let explicitNewline=false;
  const split=()=>{const start=text.selectionStart??text.value.length,end=text.selectionEnd??start,tail=text.value.slice(end);item.text=text.value.slice(0,start);add(item,tail);};
  text.addEventListener('beforeinput',e=>{if(!e.isComposing&&!explicitNewline&&['insertLineBreak','insertParagraph'].includes(e.inputType)){e.preventDefault();split();}});
  text.onkeyup=()=>explicitNewline=false;
  text.onkeydown=e=>{
   explicitNewline=e.key==='Enter'&&e.shiftKey;
   if(e.isComposing||e.keyCode===229)return;
   if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();split();}
   else if(e.key==='Backspace'&&!text.value){e.preventDefault();remove(item);}
  };
  const removeButton=document.createElement('button');removeButton.type='button';removeButton.className='cfh-check-remove';removeButton.textContent='×';removeButton.setAttribute('aria-label','Delete list item');removeButton.onpointerdown=e=>e.preventDefault();removeButton.onclick=()=>remove(item);
  text.onfocus=()=>{row.classList.add('is-editing');fit(text);};text.onblur=()=>{row.classList.remove('is-editing');fit(text);};
  row.append(grip,check,text,removeButton);requestAnimationFrame(()=>{if(text.isConnected)fit(text);});return row;
 }
 function render(current){
  cancelMove();note=current;host.replaceChildren();if(note?.kind!=='list'){addButton.hidden=true;return;}
  note.items||=[];const pending=document.createElement('div');pending.className='cfh-check-pending';
  for(const item of note.items.filter(i=>!i.checked))pending.append(makeRow(item));
  addButton.hidden=false;host.append(pending,addButton);
  const checked=note.items.filter(i=>i.checked);if(!checked.length)return;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='cfh-check-completed-toggle';const expanded=note.checkedExpanded!==false;toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls','cfhNotesCheckedItems');
  toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';const label=document.createElement('span');label.textContent=checked.length+' checked '+(checked.length===1?'item':'items');toggle.append(label);
  const completed=document.createElement('div');completed.id='cfhNotesCheckedItems';completed.hidden=!expanded;completed.className='cfh-check-completed';for(const item of checked)completed.append(makeRow(item));
  toggle.onclick=()=>{note.checkedExpanded=!expanded;changed();render(note);host.querySelector('.cfh-check-completed-toggle')?.focus({preventScroll:true});};host.append(toggle,completed);
 }
 function remove(item){
  const peers=note.items.filter(i=>!!i.checked===!!item.checked),index=peers.indexOf(item),next=peers[index+1]||peers[index-1];
  note.items=note.items.filter(i=>i!==item);changed();render(note);if(next)focusItem(next);else addButton.focus();
 }
 function add(after=null,text=''){
  if(!note||note.kind!=='list')return;note.items||=[];const item={id:id(),text,checked:false},index=after?note.items.indexOf(after):-1;
  if(index>=0)note.items.splice(index+1,0,item);else note.items.push(item);changed();render(note);focusItem(item,false);
 }
 addButton.onclick=()=>add();
 host.addEventListener('keydown',e=>{if(e.key==='Escape'&&moving){e.preventDefault();e.stopPropagation();finishMove(false);}},{capture:true});
 window.addEventListener('blur',()=>finishMove(false));document.addEventListener('visibilitychange',()=>{if(document.hidden)finishMove(false);});
 window.addEventListener('resize',()=>{if(!host.closest('#cfhNotesEditor')?.hidden)for(const field of host.querySelectorAll('textarea'))fit(field);});
 return {render,add,cancelMove:()=>{if(!moving)return false;finishMove(false);return true;}};
}
