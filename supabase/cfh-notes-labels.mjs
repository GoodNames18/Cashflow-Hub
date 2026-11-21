// Label selection keeps the existing single-label note model.
export function createLabelPicker(host,{getLabels,getSelected,select,create,requestDelete}){
 const input=document.createElement('input');input.type='search';input.placeholder='Search or create label';input.maxLength=60;input.setAttribute('aria-label','Search or create label');
 const list=document.createElement('div');list.className='cfh-note-label-list';
 const status=document.createElement('p');status.className='cfh-note-options-error';status.setAttribute('role','status');
 const apply=id=>{if(select(id)){status.textContent='';draw();}else status.textContent='Could not update the label. Try again.';};
 function draw(){
  list.replaceChildren();const query=input.value.trim(),all=getLabels();
  for(const label of all.filter(l=>l.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name))){
   const row=document.createElement('div');row.className='cfh-note-label-row';const toggle=document.createElement('label');toggle.className='cfh-note-label-toggle';
   const name=document.createElement('span');name.textContent=label.name;
   const check=document.createElement('input');check.type='checkbox';check.checked=getSelected()===label.id;check.setAttribute('aria-label',label.name);check.onchange=()=>apply(check.checked?label.id:'');toggle.append(name,check);row.append(toggle);
   if(requestDelete){
    const remove=document.createElement('button');remove.type='button';remove.className='cfh-note-label-delete';remove.textContent='Delete';remove.hidden=true;remove.setAttribute('aria-label','Delete label '+label.name);remove.onclick=()=>requestDelete(label);row.append(remove);
    let start=null,ignoreUntil=0;
    row.addEventListener('touchstart',e=>{start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
    row.addEventListener('touchend',e=>{const point=start;start=null;if(!point||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-point.x,dy=Math.abs(e.changedTouches[0].clientY-point.y);if(dx< -45&&-dx>dy*1.5){for(const other of list.querySelectorAll('.cfh-note-label-delete'))other.hidden=other!==remove;remove.hidden=false;ignoreUntil=Date.now()+400;if(e.cancelable)e.preventDefault();e.stopPropagation();}},{passive:false});
    row.addEventListener('touchcancel',()=>{start=null;});
    row.addEventListener('click',e=>{if(Date.now()<ignoreUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    row.tabIndex=0;row.setAttribute('aria-label',label.name+'; swipe left or press Delete to show delete button');row.onkeydown=e=>{if(e.key==='Delete'&&e.target===row){e.preventDefault();remove.hidden=false;remove.focus();}};
   }
   list.append(row);
  }
  if(query&&!all.some(l=>l.name.toLocaleLowerCase()===query.toLocaleLowerCase())){
   const add=document.createElement('button');add.type='button';add.className='cfh-note-label-create';add.textContent='+ Create “'+query+'”';add.onclick=()=>{const label=create(query);if(label){apply(label.id);input.value='';draw();}else status.textContent='Could not create the label. Try again.';};list.append(add);
  }else if(!list.childElementCount){const empty=document.createElement('p');empty.textContent=all.length?'No matching labels.':'No labels yet. Type a name to create one.';list.append(empty);}
 }
 input.oninput=()=>{status.textContent='';draw();};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();list.querySelector('.cfh-note-label-create')?.click();}};
 host.append(input,list,status);draw();return {input,refresh:draw};
}
export function createDeleteConfirmation(host,{permanent=false,labelName=null,cancel,remove}){
 const message=document.createElement('p');message.textContent=labelName!==null?'Delete “'+labelName+'”? Notes will be kept.':permanent?'Permanently delete this note? This cannot be undone.':'Delete this note? You can restore it from Deleted.';
 const actions=document.createElement('div');actions.className='cfh-note-delete-actions';
 for(const [text,action] of [['Cancel',cancel],['Delete',remove]]){const button=document.createElement('button');button.type='button';button.textContent=text;if(text==='Delete')button.className='cfh-note-delete-confirm';button.onclick=action;actions.append(button);}
 host.append(message,actions);
}

// Horizontal navigation does not interfere with scrolling or text-field gestures.
export function installOptionsGestures(sheet,{back,dismiss,canGoBack}){
 let start=null,ignoreUntil=0;
 sheet.addEventListener('touchstart',e=>{
  if(e.touches.length!==1||e.target.closest('input:not([type="checkbox"]),textarea,select')){start=null;return;}
  const touch=e.touches[0],bounds=sheet.getBoundingClientRect();start={x:touch.clientX,y:touch.clientY,top:touch.clientY<bounds.top+80,atTop:sheet.scrollTop<=0};
 },{passive:true});
 sheet.addEventListener('touchend',e=>{
  const point=start;start=null;if(!point||!e.changedTouches.length)return;
  const touch=e.changedTouches[0],dx=touch.clientX-point.x,dy=touch.clientY-point.y;
  const goBack=canGoBack()&&dx>55&&dx>Math.abs(dy)*1.5;
  const close=point.atTop&&dy>(point.top?55:90)&&dy>Math.abs(dx)*1.5;
  if(goBack||close){ignoreUntil=Date.now()+400;if(e.cancelable)e.preventDefault();if(goBack)back();else dismiss();}
 },{passive:false});
 sheet.addEventListener('touchcancel',()=>{start=null;});
 sheet.addEventListener('click',e=>{if(Date.now()<ignoreUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 sheet.addEventListener('wheel',e=>{if(e.deltaY< -45&&sheet.scrollTop<=0&&!e.target.closest('input,textarea,select'))dismiss();},{passive:true});
}
