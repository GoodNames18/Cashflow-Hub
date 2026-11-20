import {applyNoteFormat} from './cfh-notes-content.mjs';
import {createChecklistItem,reorderVisibleNotes} from './cfh-notes-model.mjs';

const timestampFormat=new Intl.DateTimeFormat('en-PH',{
 month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true
});

function itemTimestamp(item){
 const date=new Date(item.createdAt);
 if(!Number.isFinite(item.createdAt)||!Number.isFinite(date.getTime()))return 'Date unavailable';
 const parts=timestampFormat.formatToParts(date);
 const datePart=type=>parts.find(part=>part.type===type).value;
 return datePart('hour')+':'+datePart('minute')+' '+datePart('dayPeriod').toUpperCase()+' · '
  +datePart('month')+' '+datePart('day')+', '+datePart('year');
}

export function checklistNameCompletion(value,items,excludeId){
 const match=/^([+-]?[\d,.]+\s+)([\p{L}][\p{L} '\-]*)$/u.exec(value);
 if(!match)return null;
 const prefix=match[2],lower=prefix.toLocaleLowerCase();
 const names=new Map();
 for(const item of items||[]){
  if(item.id===excludeId||item.divider)continue;
  const previous=/^[+-]?[\d,.]+\s+([\p{L}][\p{L} '\-]*)$/u.exec(item.text?.trim()||'');
  if(!previous)continue;
  const name=previous[1],key=name.toLocaleLowerCase(),existing=names.get(key);
  names.set(key,{name,count:(existing?.count||0)+1});
 }
 const candidates=[...names.values()].filter(item=>item.name.toLocaleLowerCase().startsWith(lower));
 candidates.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 const name=candidates[0]?.name;
 const capitalized=prefix[0].toLocaleUpperCase()+prefix.slice(1);
 return {value:match[1]+(name||capitalized),start:match[1].length+capitalized.length};
}

export function createChecklist(host,addButton,{changed,id}){
 let note=null,moving=null,swipe=null,suppressSwipeClick=false,hold=null,rowMenu=null;
 const style=document.createElement('style');
 style.textContent=`
  #cfhNotesChecklist .cfh-note-check-row{touch-action:pan-y pinch-zoom}
  #cfhNotesChecklist .cfh-check-fixed{padding-top:2px;text-align:center;color:#514a65;font-size:13px}
  .cfh-check-drag-ghost .cfh-check-drag-text{
   min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:hidden;
   font:400 16px/24px Arial,sans-serif;color:#1b1844;margin:0;
  }
  .cfh-check-row-menu{border:0;border-radius:16px;padding:16px;color:#1b1844;background:#fff;width:min(300px,85vw)}
  .cfh-check-row-menu::backdrop{background:#1b184455}
  .cfh-check-row-menu button{display:block;width:100%;margin:4px 0;text-align:left}
  .cfh-check-timestamp-slot{display:none}
  #cfhNotesChecklist.is-revealing-timestamps .cfh-check-timestamp-slot{
   display:block;position:absolute;z-index:2;top:7px;right:0;max-width:100%;
   overflow:hidden;pointer-events:none;
  }
  #cfhNotesChecklist .cfh-check-timestamp-slot:has(.cfh-check-timestamp:empty){display:none}
  #cfhNotesChecklist .cfh-check-timestamp{
   display:block;padding-left:6px;text-align:right;white-space:nowrap;
   background:var(--cfh-note-background,#fff);
   line-height:24px;font-size:11px;color:#514a65;
  }
  #cfhNotesChecklist.is-revealing-timestamps .cfh-check-timestamp{
   transform:translateX(max(0px,calc(100% - var(--cfh-check-swipe))));
  }`;
 document.head.append(style);
 const blanks=new Map();
 let manualBlankId=null;
 const inCompleted=item=>item.checked&&!item.divider&&(!item.pinned||item.pinInCompleted);
 const hasDivider=()=>note?.items?.some(item=>item.divider);
 function cancelHold(){
  if(!hold)return;
  clearTimeout(hold.timer);hold=null;
 }
 function showRowMenu(item){
  cancelHold();endSwipe();cancelMove();rowMenu?.close();
  const menu=document.createElement('dialog');menu.className='cfh-check-row-menu';
  menu.setAttribute('aria-label','Checklist row options');
  function action(label,apply){
   const button=document.createElement('button');button.type='button';button.textContent=label;
   button.onclick=()=>{menu.close();if(apply){apply();changed();render(note);}};
   menu.append(button);
  }
  action(item.pinned?'Unpin row':'Pin row',()=>{
   if(item.pinned){delete item.pinned;delete item.pinInCompleted;}
   else{const completed=inCompleted(item);item.pinned=true;if(completed)item.pinInCompleted=true;}
  });
  action(item.divider?'Remove divider':'Make divider',()=>{
   if(item.divider)delete item.divider;
   else item.divider=true;
  });
  action('Cancel');
  document.body.append(menu);rowMenu=menu;
  menu.addEventListener('close',()=>{if(rowMenu===menu)rowMenu=null;menu.remove();});
  document.activeElement?.blur();window.getSelection?.()?.removeAllRanges();
  menu.showModal();
 }
 host.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary||e.target.tagName!=='TEXTAREA')return;
  const row=e.target.closest('[data-check-id]');
  const item=note?.items?.find(item=>item.id===row?.dataset.checkId);
  if(!item)return;
  cancelHold();
  hold={pointer:e.pointerId,x:e.clientX,y:e.clientY,timer:setTimeout(()=>{
   if(moving?.active)return;
   suppressSwipeClick=true;showRowMenu(item);
  },3000)};
 },true);
 window.addEventListener('pointermove',e=>{
  if(hold?.pointer===e.pointerId&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>8)cancelHold();
 });
 for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{
  if(hold?.pointer===e.pointerId)cancelHold();
 });
 // Android can cancel pointer events when native text selection begins.
 // Keep the timer tied to the physical touch as well as the pointer.
 host.addEventListener('touchstart',e=>{
  if(e.touches.length!==1){cancelHold();return;}
  const field=e.target.closest('textarea');
  const row=field?.closest('[data-check-id]');
  const item=note?.items?.find(item=>item.id===row?.dataset.checkId);
  if(!item)return;
  cancelHold();
  const touch=e.touches[0];
  hold={touch:touch.identifier,x:touch.clientX,y:touch.clientY,timer:setTimeout(()=>{
   suppressSwipeClick=true;showRowMenu(item);
  },3000)};
 },{passive:true});
 host.addEventListener('touchmove',e=>{
  if(hold?.touch===undefined)return;
  const touch=[...e.touches].find(touch=>touch.identifier===hold.touch);
  if(!touch||Math.hypot(touch.clientX-hold.x,touch.clientY-hold.y)>12)cancelHold();
 },{passive:true});
 for(const event of ['touchend','touchcancel'])window.addEventListener(event,()=>cancelHold(),{passive:true});
 host.addEventListener('contextmenu',e=>{if(e.target.closest('textarea'))e.preventDefault();});
 host.addEventListener('keydown',e=>{
  if(e.key!=='ContextMenu'&&!(e.shiftKey&&e.key==='F10'))return;
  const row=e.target.closest('[data-check-id]');
  const item=note?.items?.find(item=>item.id===row?.dataset.checkId);
  if(item){e.preventDefault();showRowMenu(item);}
 });
 function moveGroup(row){
  const rows=[];
  for(let previous=row.previousElementSibling;previous&&!previous.dataset.fixed;previous=previous.previousElementSibling)rows.unshift(previous);
  rows.push(row);
  for(let next=row.nextElementSibling;next&&!next.dataset.fixed;next=next.nextElementSibling)rows.push(next);
  return rows;
 }
 function insertBlank(divider,dividerRow){
  const item={id:id(),text:'',checked:false};
  const row=makeRow(item,divider);
  blanks.set(divider.id,item);dividerRow.before(row);
 }

 function endSwipe(){
  const revealed=swipe?.revealed;
  swipe=null;
  host.classList.remove('is-revealing-timestamps');
  host.style.removeProperty('--cfh-check-swipe');
  return revealed;
 }
 host.addEventListener('pointerdown',e=>{
  suppressSwipeClick=false;
  if(e.pointerType!=='touch'||!e.isPrimary||moving||!e.target.closest('[data-check-id]')
    ||e.target.closest('.cfh-check-grip,.cfh-check-remove'))return;
  swipe={pointer:e.pointerId,x:e.clientX,y:e.clientY,revealed:false};
 });
 window.addEventListener('pointermove',e=>{
  if(swipe?.pointer!==e.pointerId)return;
  const dx=swipe.x-e.clientX,dy=Math.abs(swipe.y-e.clientY);
  if(!swipe.revealed){
   if((dy>10&&dy>=Math.abs(dx))||dx < -10){endSwipe();return;}
   if(dx<12||dx<dy*1.3)return;
   swipe.revealed=true;
   host.classList.add('is-revealing-timestamps');
  }
  e.preventDefault();
  host.style.setProperty('--cfh-check-swipe',Math.max(0,dx)+'px');
 },{passive:false});
 window.addEventListener('pointerup',e=>{
  if(swipe?.pointer!==e.pointerId)return;
  suppressSwipeClick=!!endSwipe();
  if(suppressSwipeClick)e.preventDefault();
 },{passive:false});
 host.addEventListener('click',e=>{
  if(!suppressSwipeClick||e.detail===0)return;
  suppressSwipeClick=false;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
 window.addEventListener('pointercancel',e=>{
  if(swipe?.pointer===e.pointerId)endSwipe();
 });
 addButton.replaceChildren();const plus=document.createElement('span');plus.textContent='＋';plus.setAttribute('aria-hidden','true');addButton.append(plus);addButton.setAttribute('aria-label','Add list item');
 const rowFor=item=>[...host.querySelectorAll('[data-check-id]')].find(row=>row.dataset.checkId===item.id);
 function fit(field){const area=host.closest('.cfh-note-editor-content'),y=area?.scrollTop;field.style.height='0px';field.style.height=Math.max(24,field.scrollHeight)+'px';if(area)area.scrollTop=y;}
 function focusItem(item,end=true){if(!item)return;const field=rowFor(item)?.querySelector('textarea');if(!field)return;field.focus();const at=end?field.value.length:0;field.setSelectionRange?.(at,at);}
 function cancelMove(){
  if(!moving)return false;const old=moving;moving=null;if(old.frame)cancelAnimationFrame(old.frame);
  old.ghost?.remove();old.marker?.remove();old.row.classList.remove('is-moving');return true;
 }
 function finishMove(commit){
  if(!moving)return;const {active,rows,row,dropIndex}=moving,ids=active?rows.filter(n=>n!==row).map(n=>n.dataset.checkId):[];
  if(active&&dropIndex!==null&&dropIndex!==undefined)ids.splice(dropIndex,0,row.dataset.checkId);else commit=false;
  cancelMove();if(!active)return;
  if(commit){const map=new Map(note.items.map(item=>[item.id,item]));note.items=reorderVisibleNotes(note.items.map(item=>item.id),ids).map(key=>map.get(key));changed();}
  render(note);
 }
 function place(x,y){
  if(!moving)return;
  if(!moving.active&&Math.hypot(x-moving.x,y-moving.y)<5)return;
  if(!moving.active){
   endSwipe();cancelHold();document.activeElement?.blur();
   moving.active=true;moving.row.classList.add('is-moving');
   const source=moving.row.querySelector('textarea'),bounds=moving.row.getBoundingClientRect();
   moving.ghost=document.createElement('div');moving.ghost.className='cfh-check-drag-ghost';
   moving.ghost.setAttribute('aria-hidden','true');
   const text=document.createElement('div');text.className='cfh-check-drag-text';
   text.textContent=source.value||' ';text.style.cssText=source.style.cssText;
   // The preview uses ordinary text so Android cannot clip a cloned text field.
   text.style.height='auto';text.style.padding='0';text.style.width='100%';
   moving.ghost.append(text);moving.ghost.style.width=bounds.width+'px';
   moving.ghost.style.background=getComputedStyle(host.closest('#cfhNotesEditorBox')).getPropertyValue('--cfh-note-background')||'#fff';
   moving.marker=document.createElement('span');moving.marker.className='cfh-check-drop-marker';
   moving.marker.setAttribute('aria-hidden','true');document.body.append(moving.ghost,moving.marker);
   moving.offsetX=x-bounds.left;
  }
  moving.lastX=x;moving.lastY=y;
  const viewport=window.visualViewport;
  const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
  const preview=moving.ghost.getBoundingClientRect();
  moving.ghost.style.left=Math.max(left+4,Math.min(x-moving.offsetX,left+width-preview.width-4))+'px';
  moving.ghost.style.top=Math.max(top+4,Math.min(y-15,top+height-preview.height-4))+'px';
  // Keep the captured grip in its original DOM position until pointerup.
  // Reparenting its row during a touch drag can lose Android pointer capture.
  const rows=moving.rows.filter(row=>row!==moving.row),area=host.closest('.cfh-note-editor-content'),bounds=area.getBoundingClientRect();
  const valid=x>=bounds.left-32&&x<=bounds.right+32;
  moving.dropIndex=valid?rows.findIndex(row=>{const r=row.getBoundingClientRect();return y<r.top+r.height/2;}):null;
  if(moving.dropIndex===-1)moving.dropIndex=rows.length;
  moving.marker.hidden=!valid;
  if(valid){const groupRect=moving.group.getBoundingClientRect(),target=rows[moving.dropIndex],last=rows.at(-1),top=target?target.getBoundingClientRect().top:last?last.getBoundingClientRect().bottom:moving.row.getBoundingClientRect().top;
   Object.assign(moving.marker.style,{left:groupRect.left+'px',top:top+'px',width:groupRect.width+'px'});
  }
 }
 function bindGrip(grip,row){
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();cancelMove();moving={row,group:row.parentElement,rows:moveGroup(row),pointer:e.pointerId,x:e.clientX,y:e.clientY,dropIndex:null};grip.setPointerCapture?.(e.pointerId);
   const scroll=()=>{if(!moving)return;if(moving.active){const area=host.closest('.cfh-note-editor-content'),r=area.getBoundingClientRect(),y=moving.lastY,dy=y<r.top+35?-10:y>r.bottom-35?10:0;if(dy){area.scrollTop+=dy;place(moving.lastX,moving.lastY);}}moving.frame=requestAnimationFrame(scroll);};moving.frame=requestAnimationFrame(scroll);
  });
  grip.addEventListener('contextmenu',e=>e.preventDefault());
  grip.addEventListener('keydown',e=>{
   if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
   const rows=moveGroup(row),from=rows.indexOf(row),to=from+(e.key==='ArrowUp'?-1:1);if(to<0||to>=rows.length)return;
   const ids=rows.map(r=>r.dataset.checkId);ids.splice(to,0,ids.splice(from,1)[0]);const map=new Map(note.items.map(item=>[item.id,item]));note.items=reorderVisibleNotes(note.items.map(item=>item.id),ids).map(key=>map.get(key));changed();const key=row.dataset.checkId;render(note);rowFor({id:key})?.querySelector('.cfh-check-grip')?.focus();
  });
 }
 function makeGrip(item,row,fixed){
  const grip=document.createElement(item.checked||fixed?'span':'button');grip.className='cfh-check-grip';
  if(!item.checked&&!fixed){grip.type='button';grip.setAttribute('aria-label','Move list item');grip.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');grip.innerHTML='<svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';bindGrip(grip,row);}else{
   grip.setAttribute('aria-hidden','true');
   if(item.pinned||item.divider){grip.classList.add('cfh-check-fixed');grip.textContent=item.pinned?'📌':'—';}
  }
  return grip;
 }
 function makeRow(item,blankFor=null){
  const row=document.createElement('div');row.className='cfh-note-check-row'+(item.checked?' is-checked':'');row.dataset.checkId=item.id;
  const fixed=!!(item.pinned||item.divider||blankFor);
  if(fixed)row.dataset.fixed='true';
  let grip=makeGrip(item,row,fixed);
  const check=document.createElement('input');check.type='checkbox';check.checked=!!item.checked;check.disabled=!!(blankFor||item.divider);check.setAttribute('aria-label',(item.checked?'Uncheck ':'Complete ')+(item.text||'item'));
  const text=document.createElement('textarea');text.rows=1;text.setAttribute('aria-label','List item');text.value=item.text||'';applyNoteFormat(text,item.format);
  text.autocapitalize='words';text.autocomplete='off';
  let completion=null;
  const amountOnly=()=>/^[+-]?[\d,.]*$/.test(text.value);
  function updateKeyboard(){
   const numeric=amountOnly();
   text.inputMode=numeric?'decimal':'text';text.enterKeyHint=numeric?'next':'enter';
  }
  updateKeyboard();
  text.addEventListener('beforeinput',e=>{
   if(completion&&e.inputType?.startsWith('delete')&&text.selectionStart===completion.start&&text.selectionEnd===completion.end){
    e.preventDefault();text.value=text.value.slice(0,completion.start);completion=null;
    text.setSelectionRange(text.value.length,text.value.length);
    text.oninput({inputType:'deleteContentBackward'});
   }
  });
  if(item.checked&&item.format?.u)text.style.textDecorationLine='underline line-through';
  check.onchange=()=>{item.checked=check.checked;changed();render(note);rowFor(item)?.querySelector('input')?.focus({preventScroll:true});};
  text.oninput=(event={})=>{
   completion=null;
   if(!event.isComposing&&!event.inputType?.startsWith('delete')&&text.selectionStart===text.value.length&&text.selectionEnd===text.value.length){
    const result=checklistNameCompletion(text.value,note.items,item.id);
    if(result){
     text.value=result.value;
     text.setSelectionRange(result.start,result.value.length);
     if(result.start<result.value.length)completion={start:result.start,end:result.value.length};
    }
   }
   updateKeyboard();item.text=text.value;
   if(blankFor){
    if(!item.text.trim()){fit(text);return;}
    const index=note.items.indexOf(blankFor),dividerRow=rowFor(blankFor);
    if(index<0||!dividerRow)return;
    item.createdAt=Date.now();note.items.splice(index,0,item);
    blankFor=null;check.disabled=false;delete row.dataset.fixed;
    const liveGrip=makeGrip(item,row,false);grip.replaceWith(liveGrip);grip=liveGrip;
    insertBlank(note.items[index+1],dividerRow);
    timestamp.textContent=itemTimestamp(item);
    text.setAttribute('aria-description',timestamp.textContent);
   }
   check.setAttribute('aria-label',(item.checked?'Uncheck ':'Complete ')+(item.text||'item'));fit(text);changed();};
  let explicitNewline=false;
  text.addEventListener('compositionend',()=>text.oninput({inputType:'insertText'}));
  const split=()=>{
   if(amountOnly()&&/\d/.test(text.value)){
    text.value+=' ';text.oninput({inputType:'insertText'});
    text.blur();text.focus({preventScroll:true});text.setSelectionRange(text.value.length,text.value.length);return;
   }
   if(blankFor)return;const start=text.selectionStart??text.value.length,end=text.selectionEnd??start,tail=text.value.slice(end);item.text=text.value.slice(0,start);text.value=item.text;fit(text);changed();add(item,tail);};
  text.addEventListener('beforeinput',e=>{if(!e.isComposing&&!explicitNewline&&['insertLineBreak','insertParagraph'].includes(e.inputType)){e.preventDefault();split();}});
  text.onkeyup=()=>explicitNewline=false;
  text.onkeydown=e=>{
   explicitNewline=e.key==='Enter'&&e.shiftKey;
   if(e.isComposing||e.keyCode===229)return;
   if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();split();}
   else if(e.key==='Backspace'&&!text.value){e.preventDefault();if(!blankFor)remove(item);}
  };
  const removeButton=document.createElement('button');removeButton.type='button';removeButton.className='cfh-check-remove';removeButton.textContent='×';removeButton.setAttribute('aria-label','Delete list item');removeButton.onpointerdown=e=>e.preventDefault();removeButton.onclick=()=>{if(!blankFor)remove(item);};
  text.onfocus=()=>{if(!blankFor)row.classList.add('is-editing');fit(text);};text.onblur=()=>{
   row.classList.remove('is-editing');fit(text);
   if(hasDivider()&&!item.pinned&&!item.divider&&!item.text.trim()&&row.isConnected&&!blankFor){
    row.remove();
   }
  };
  const timestamp=document.createElement('span');timestamp.className='cfh-check-timestamp';
  timestamp.textContent=blankFor?'':itemTimestamp(item);timestamp.setAttribute('aria-hidden','true');
  text.setAttribute('aria-description',timestamp.textContent);
  const timestampSlot=document.createElement('span');timestampSlot.className='cfh-check-timestamp-slot';
  timestampSlot.append(timestamp);
  row.append(grip,check,text,removeButton,timestampSlot);requestAnimationFrame(()=>{if(text.isConnected)fit(text);});return row;
 }
 function render(current){
  endSwipe();cancelHold();cancelMove();blanks.clear();if(note!==current)manualBlankId=null;note=current;host.replaceChildren();if(note?.kind!=='list'){addButton.hidden=true;return;}
  note.items||=[];const pending=document.createElement('div');pending.className='cfh-check-pending';
  const divided=hasDivider();
  for(const item of note.items.filter(item=>!inCompleted(item))){
   if(divided&&item.id!==manualBlankId&&!item.divider&&!item.pinned&&!item.text?.trim())continue;
   const row=makeRow(item);
   pending.append(row);
   if(item.divider)insertBlank(item,row);
  }
  addButton.hidden=!!divided;host.append(pending,addButton);
  const checked=note.items.filter(inCompleted);if(!checked.length)return;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='cfh-check-completed-toggle';const expanded=note.checkedExpanded!==false;toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls','cfhNotesCheckedItems');
  toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';const label=document.createElement('span');label.textContent=checked.length+' checked '+(checked.length===1?'item':'items');toggle.append(label);
  const completed=document.createElement('div');completed.id='cfhNotesCheckedItems';completed.hidden=!expanded;completed.className='cfh-check-completed';for(const item of checked)completed.append(makeRow(item));
  toggle.onclick=()=>{note.checkedExpanded=!expanded;changed();render(note);host.querySelector('.cfh-check-completed-toggle')?.focus({preventScroll:true});};host.append(toggle,completed);
 }
 function remove(item){
  const peers=note.items.filter(i=>!!inCompleted(i)===!!inCompleted(item)),index=peers.indexOf(item),next=peers[index+1]||peers[index-1];
  note.items=note.items.filter(i=>i!==item);changed();render(note);if(next)focusItem(next);else addButton.focus();
 }
 function add(after=null,text=''){
  if(!note||note.kind!=='list')return;
  if(!text&&hasDivider()){
   const start=after?note.items.indexOf(after)+1:0;
   const divider=note.items.slice(start).find(item=>item.divider);
   if(divider){focusItem(blanks.get(divider.id));return;}
  }
  note.items||=[];const item=createChecklistItem(text,id),index=after?note.items.indexOf(after):-1;
  if(!text)manualBlankId=item.id;
  if(index>=0)note.items.splice(index+1,0,item);else note.items.push(item);changed();render(note);focusItem(item,false);
 }
 addButton.onclick=()=>add();
 window.addEventListener('pointermove',e=>{if(moving?.pointer===e.pointerId){e.preventDefault();place(e.clientX,e.clientY);}},{passive:false});
 window.addEventListener('pointerup',e=>{if(moving?.pointer===e.pointerId){e.preventDefault();if(moving.active)place(e.clientX,e.clientY);finishMove(true);}},{passive:false});
 window.addEventListener('pointercancel',e=>{if(moving?.pointer===e.pointerId)finishMove(false);});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'&&moving){e.preventDefault();e.stopPropagation();finishMove(false);}},{capture:true});
 window.addEventListener('blur',()=>{cancelHold();endSwipe();finishMove(false);});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelHold();endSwipe();finishMove(false);}});
 window.addEventListener('resize',()=>{if(!host.closest('#cfhNotesEditor')?.hidden)for(const field of host.querySelectorAll('textarea'))fit(field);});
 return {render,add,cancelMove:()=>{cancelHold();if(rowMenu?.open){rowMenu.close();return true;}if(endSwipe())return true;if(!moving)return false;finishMove(false);return true;}};
}
