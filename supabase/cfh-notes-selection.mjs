// Batch edits preserve note/row identities, original dates and unrelated content.
export function updateSelectedNotes(notes,ids,patch,now=Date.now()){
 const selected=new Set(ids);
 return notes.map(note=>selected.has(note.id)?{...note,...(typeof patch==='function'?patch(note):patch),updatedAt:now}:note);
}
export function createNoteSelection(page,{icon,action}){
 let latest=[];const selected=new Set(),head=page.querySelector('.cfh-notes-head');
 const bar=document.createElement('header');bar.className='cfh-notes-selection';bar.hidden=true;bar.setAttribute('aria-label','Selected notes');
 function button(label,fn,symbol){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);if(symbol)b.append(icon(symbol));else b.textContent=label;b.onclick=fn;return b;}
 const count=document.createElement('span');count.setAttribute('role','status');
 const close=button('Clear selection',()=>clear(),'close');bar.append(close,count);
 const pin=button('Pin selected notes',()=>action('pin',[...selected]),'pin');bar.append(pin);
 for(const [name,symbol] of [['Reminder','reminders'],['Color','palette'],['Labels','label'],['More','more']])bar.append(button(name+' for selected notes',()=>action(name.toLowerCase(),[...selected]),symbol));
 head.before(bar);
 function paint(){
  page.classList.toggle('cfh-notes-selecting',!!selected.size);bar.hidden=!selected.size;head.hidden=!!selected.size;count.textContent=String(selected.size)+' selected';const allPinned=selected.size>0&&latest.filter(n=>selected.has(n.id)).every(n=>n.pinned);pin.setAttribute('aria-label',allPinned?'Unpin selected notes':'Pin selected notes');pin.setAttribute('aria-pressed',String(allPinned));
  for(const card of page.querySelectorAll('[data-note-id]')){const active=selected.has(card.dataset.noteId);card.classList.toggle('is-selected',active);card.setAttribute('aria-pressed',String(active));}
 }
 function clear(){selected.clear();paint();}
 function add(id){selected.add(id);paint();}
 return {get active(){return selected.size>0;},has:id=>selected.has(id),add,clear,
  toggle(id){if(selected.has(id))selected.delete(id);else selected.add(id);paint();},
  refresh(notes){latest=notes;const available=new Set(notes.map(n=>n.id));for(const id of selected)if(!available.has(id))selected.delete(id);paint();}
 };
}
