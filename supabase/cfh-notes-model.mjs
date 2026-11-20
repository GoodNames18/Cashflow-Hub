export function noteMatches(note,filter='all',query='',now=Date.now()){
 const q=query.trim().toLocaleLowerCase();if(q&&!`${note.title||''} ${note.body||''} ${note.bodyAfter||''} ${(note.items||[]).map(i=>i.text).join(' ')}`.toLocaleLowerCase().includes(q))return false;
 if(filter==='deleted')return !!note.deletedAt;if(note.deletedAt)return false;
 if(filter==='archive')return !!note.archived;if(note.archived)return false;
 if(filter==='reminders')return !!note.reminder;if(filter==='pinned')return !!note.pinned;
 if(filter.startsWith('label:'))return note.labelId===filter.slice(6);return true;
}
export function compareNotes(a,b,sort='updated'){if(sort==='title')return String(a.title||a.body||'').localeCompare(String(b.title||b.body||''));return (Number(b[sort==='created'?'createdAt':'updatedAt'])||0)-(Number(a[sort==='created'?'createdAt':'updatedAt'])||0);}
export function changeNoteState(note,action,now=Date.now()){const next={...note,updatedAt:now};if(action==='delete')next.deletedAt=now;else if(action==='restore')delete next.deletedAt;else if(action==='archive')next.archived=true;else if(action==='unarchive')next.archived=false;else throw Error('Unknown note action');return next;}
export function createChecklistItem(text,id){return {id:id(),text,checked:false,...(text.trim()?{createdAt:Date.now()}:{})};}
export function checklistFromText(text,id=()=>crypto.randomUUID()){return String(text).split('\n').map(t=>t.trim()).filter(Boolean).map(text=>createChecklistItem(text,id));}
export function removeLabel(notes,labelId){return notes.map(n=>n.labelId===labelId?{...n,labelId:''}:n);}

// Manual order lives separately from content dates. New notes appear first.
export function customNoteIds(notes,saved=[]){
 const ids=new Set(notes.map(n=>n.id));const known=[...new Set((Array.isArray(saved)?saved:[]).filter(id=>ids.has(id)))];const seen=new Set(known);
 return [...notes.filter(n=>!seen.has(n.id)).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)).map(n=>n.id),...known];
}
export function reorderVisibleNotes(allIds,visibleIds){
 const visible=[...new Set(visibleIds)].filter(id=>allIds.includes(id)),members=new Set(visible);let index=0;
 return allIds.map(id=>members.has(id)?visible[index++]:id);
}

// A row's original timestamp belongs to the current nonblank entry.
export function setChecklistText(item,text,now=Date.now(),items=[]){
 const wasBlank=!item.text?.trim(),isBlank=!text.trim();
 if(isBlank){
  delete item.createdAt;
  delete item.addedOrder;
  delete item.conversionCreatedAt;
  delete item.originalDateUnavailable;
  delete item.recoveredFromCheckboxText;
 }else if(wasBlank){
  item.createdAt=now;
  item.addedOrder=nextChecklistOrder(items);
  delete item.conversionCreatedAt;
  delete item.originalDateUnavailable;
  delete item.recoveredFromCheckboxText;
 }
 item.text=text;
 return item;
}

// Once assigned, row addition order survives dragging, editing and undo/redo.
function nextChecklistOrder(items){return items.reduce((max,item)=>Math.max(max,Number(item.addedOrder)||0),0)+1;}
export function ensureChecklistOrder(items=[]){
 let next=nextChecklistOrder(items);
 const missing=items.filter(item=>item.text?.trim()&&!Number.isFinite(item.addedOrder));
 missing.sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0));
 for(const item of missing)item.addedOrder=next++;
}
