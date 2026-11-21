import {createDeleteConfirmation} from './cfh-notes-labels.mjs';

export function installLabelManagerStyles(doc){
 if(doc.getElementById('cfh-label-manager-style'))return;
 const style=doc.createElement('style');style.id='cfh-label-manager-style';style.textContent=`
 #cfhNotesUtility.cfh-notes-label-manager{padding:20px;max-width:430px}
 .cfh-notes-label-manager .cfh-label-form{display:grid;grid-template-columns:minmax(0,1fr) 40px 40px;align-items:center;gap:6px;margin:0 0 8px}
 .cfh-notes-label-manager .cfh-label-form input{box-sizing:border-box;width:100%;min-width:0;max-width:none;height:42px;margin:0;padding:8px 10px;font:16px Arial,sans-serif;background:#fff;color:#1B1844;border:1px solid #dedbef;border-radius:9px}
 .cfh-notes-label-manager .cfh-label-new input{grid-column:span 2}
 .cfh-notes-label-manager .cfh-label-form button{display:grid;place-items:center;box-sizing:border-box;width:40px;height:40px;min-height:40px;margin:0;padding:9px;border:0;border-radius:9px;background:#e9e6fa;color:#1B1844}
 .cfh-notes-label-manager .cfh-label-form button svg{display:block;width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 .cfh-notes-label-manager .cfh-label-form .cfh-label-remove{color:#a52d45}
 #cfhNotesUtility.cfh-notes-label-manager #cfhNotesUtilityClose{box-sizing:border-box;width:100%;min-height:44px;margin:8px 0 0;background:#00F8B9}
 .cfh-notes-label-manager .cfh-label-confirm p{font-size:15px;line-height:1.4}
 .cfh-notes-label-manager .cfh-note-delete-actions{display:flex;gap:8px}
 .cfh-notes-label-manager .cfh-note-delete-actions button{flex:1;min-height:44px;margin:0}
 .cfh-notes-label-manager .cfh-note-delete-confirm{color:#a52d45}
 #cfhNotesCreateButton,#cfhNotesCreateMenu .cfh-notes-create-choice,#cfhNotesCreateMenu .cfh-notes-create-close{-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
 #cfhNotesCreateButton:focus:not(:focus-visible),#cfhNotesCreateMenu button:focus:not(:focus-visible){outline:none}
 #cfhNotesCreateButton:focus-visible,#cfhNotesCreateMenu button:focus-visible{outline:2px solid #1B1844;outline-offset:3px}
 `;doc.head.append(style);
}

export function createLabelManager(host,{getLabels,create,rename,remove,focusNew=false}){
 const doc=host.ownerDocument;
 const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const editor=make('div','cfh-label-editor'),list=make('div','cfh-label-list');
 function control(label,path,cls=''){
  const b=make('button',cls);b.type='button';b.setAttribute('aria-label',label);b.title=label;
  const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const p=doc.createElementNS(icon.namespaceURI,'path');p.setAttribute('d',path);icon.append(p);b.append(icon);return b;
 }
 const addForm=make('form','cfh-label-form cfh-label-new'),input=make('input');input.placeholder='New label';input.setAttribute('aria-label','New label');input.maxLength=60;input.required=true;
 const add=control('Create label','M12 4v16M4 12h16');add.type='submit';addForm.append(input,add);
 addForm.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name)return;const label=create(name);if(label){appendRow(label);input.value='';input.focus();}};
 function appendRow(label){
  const row=make('form','cfh-label-form cfh-label-existing'),text=make('input');text.value=label.name;text.maxLength=60;text.required=true;text.setAttribute('aria-label','Label name');
  const save=control('Save label '+label.name,'M4 3h13l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8'),trash=control('Delete label '+label.name,'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7','cfh-label-remove');save.type='submit';
  row.onsubmit=e=>{e.preventDefault();const name=text.value.trim();if(name&&rename(label.id,name)){text.value=name;save.setAttribute('aria-label','Save label '+name);trash.setAttribute('aria-label','Delete label '+name);save.title='Save label '+name;trash.title='Delete label '+name;}};
  trash.onclick=()=>{
   const current=getLabels().find(l=>l.id===label.id);if(!current)return;
   const confirm=make('section','cfh-label-confirm');editor.hidden=true;
   const done=doc.getElementById('cfhNotesUtilityClose'),oldHidden=done?.hidden;if(done)done.hidden=true;
   const finish=()=>{confirm.remove();editor.hidden=false;if(done)done.hidden=oldHidden;trash.focus();};
   createDeleteConfirmation(confirm,{labelName:current.name,cancel:finish,remove:()=>{if(remove(label.id)){finish();row.remove();input.focus();}}});host.append(confirm);confirm.querySelector('button').focus();
  };
  row.append(text,save,trash);list.append(row);
 }
 for(const label of getLabels())appendRow(label);
 editor.append(addForm,list);host.append(editor);if(focusNew)input.focus();return {input};
}
