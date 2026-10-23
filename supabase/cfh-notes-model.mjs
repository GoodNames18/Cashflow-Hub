export function noteMatches(note,filter='all',query='',now=Date.now()){
 const q=query.trim().toLocaleLowerCase();if(q&&!`${note.title||''} ${note.body||''} ${note.bodyAfter||''} ${(note.items||[]).map(i=>i.text).join(' ')}`.toLocaleLowerCase().includes(q))return false;
 if(filter==='deleted')return !!note.deletedAt;if(note.deletedAt)return false;
 if(filter==='archive')return !!note.archived;if(note.archived)return false;
 if(filter==='reminders')return !!note.reminder;if(filter==='pinned')return !!note.pinned;
 if(filter.startsWith('label:'))return note.labelId===filter.slice(6);return true;
}
export function compareNotes(a,b,sort='updated'){if(sort==='title')return String(a.title||a.body||'').localeCompare(String(b.title||b.body||''));return (Number(b[sort==='created'?'createdAt':'updatedAt'])||0)-(Number(a[sort==='created'?'createdAt':'updatedAt'])||0);}
export function changeNoteState(note,action,now=Date.now()){const next={...note,updatedAt:now};if(action==='delete')next.deletedAt=now;else if(action==='restore')delete next.deletedAt;else if(action==='archive')next.archived=true;else if(action==='unarchive')next.archived=false;else throw Error('Unknown note action');return next;}
export function checklistFromText(text,id=()=>crypto.randomUUID()){return String(text).split('\n').map(t=>t.trim()).filter(Boolean).map(text=>({id:id(),text,checked:false}));}
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
