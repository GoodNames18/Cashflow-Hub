// Label selection keeps the existing single-label note model.
export function createLabelPicker(host,{getLabels,getSelected,select,create}){
 const input=document.createElement('input');input.type='search';input.placeholder='Search or create label';input.maxLength=60;input.setAttribute('aria-label','Search or create label');
 const list=document.createElement('div');list.className='cfh-note-label-list';
 const status=document.createElement('p');status.className='cfh-note-options-error';status.setAttribute('role','status');
 const apply=id=>{if(select(id)){status.textContent='';draw();}else status.textContent='Could not update the label. Try again.';};
 function draw(){
  list.replaceChildren();const query=input.value.trim(),all=getLabels();
  for(const label of all.filter(l=>l.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name))){
   const row=document.createElement('label');row.className='cfh-note-label-row';
   const name=document.createElement('span');name.textContent=label.name;
   const check=document.createElement('input');check.type='checkbox';check.checked=getSelected()===label.id;check.setAttribute('aria-label',label.name);check.onchange=()=>apply(check.checked?label.id:'');row.append(name,check);list.append(row);
  }
  if(query&&!all.some(l=>l.name.toLocaleLowerCase()===query.toLocaleLowerCase())){
   const add=document.createElement('button');add.type='button';add.className='cfh-note-label-create';add.textContent='+ Create “'+query+'”';add.onclick=()=>{const label=create(query);if(label){apply(label.id);input.value='';draw();}else status.textContent='Could not create the label. Try again.';};list.append(add);
  }else if(!list.childElementCount){const empty=document.createElement('p');empty.textContent=all.length?'No matching labels.':'No labels yet. Type a name to create one.';list.append(empty);}
 }
 input.oninput=()=>{status.textContent='';draw();};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();list.querySelector('.cfh-note-label-create')?.click();}};
 host.append(input,list,status);draw();return {input,refresh:draw};
}
export function createDeleteConfirmation(host,{permanent=false,cancel,remove}){
 const message=document.createElement('p');message.textContent=permanent?'Permanently delete this note? This cannot be undone.':'Delete this note? You can restore it from Deleted.';
 const actions=document.createElement('div');actions.className='cfh-note-delete-actions';
 for(const [text,action] of [['Cancel',cancel],['Delete',remove]]){const button=document.createElement('button');button.type='button';button.textContent=text;if(text==='Delete')button.className='cfh-note-delete-confirm';button.onclick=action;actions.append(button);}
 host.append(message,actions);
}
