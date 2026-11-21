// Display separators never change numeric values sent to the finance model.
export const numberValue = value => Number(typeof value === 'string' ? value.replace(/,/g,'') : value);
export function formatAmount(value) {
 const text=String(value),raw=text.replace(/,/g,'');
 if(!/^[+−-]?\d*(?:\.\d*)?$/.test(raw))return text;
 const [integer,fraction]=raw.split('.');
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction);
}
export function formatNoteNumbers(value) {
 const text=String(value),protectedRanges=[];
 // Dates, times, phone numbers, account/card identifiers and mixed-letter IDs.
 const protect=/(?:\b\d{1,4}[\/-]\d{1,2}(?:[\/-]\d{1,4})?\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:phone|mobile|tel|account|card|id|reference|ref)\s*[:#-]?\s*[\d, -]+|\b[A-Za-z]+\d[\w-]*|\b\d+[A-Za-z][\w-]*)/gi;
 for(const m of text.matchAll(protect))protectedRanges.push([m.index,m.index+m[0].length]);
 for(const m of text.matchAll(/\+?\d[\d ()-]{8,}\d/g)){if(m[0].replace(/\D/g,'').length>=10)protectedRanges.push([m.index,m.index+m[0].length]);}
 return text.replace(/\d[\d,]*(?:\.\d*)?/g,(token,index)=>{
  if(protectedRanges.some(([a,b])=>index>=a&&index<b)||/^0\d/.test(token.replace(/,/g,'')))return token;
  return formatAmount(token);
 });
}
function caretOffset(before,after,position) {
 const logical=before.slice(0,position).replace(/,/g,'').length;
 let i=0,n=0;while(i<after.length&&n<logical){if(after[i]!==',')n++;i++;}
 while(after[i]===',')i++;
 return i;
}
export function formatTextField(field,mixed=false) {
 const before=field.value,after=mixed?formatNoteNumbers(before):formatAmount(before);
 if(before===after)return;
 const start=field.selectionStart,end=field.selectionEnd,direction=field.selectionDirection;
 field.value=after;
 if(start!==null)try{field.setSelectionRange(caretOffset(before,after,start),caretOffset(before,after,end),direction);}catch{}
}
export function formatRichText(host) {
 const doc=host.ownerDocument,selection=doc.defaultView.getSelection();
 const saved=selection?.rangeCount?selection.getRangeAt(0):null;
 const anchor=selection?.anchorNode,focus=selection?.focusNode,ao=selection?.anchorOffset,fo=selection?.focusOffset;
 const walker=doc.createTreeWalker(host,4),edits=[];let node;
 while((node=walker.nextNode())){
  if(node.parentElement?.closest('[contenteditable="false"],.cfh-note-math-result,[data-math-result],[data-note-math-result],audio,script,style'))continue;
  const before=node.data,after=formatNoteNumbers(before);if(before!==after)edits.push({node,before,after});
 }
 let a=ao,f=fo;
 for(const e of edits){if(e.node===anchor)a=caretOffset(e.before,e.after,ao);if(e.node===focus)f=caretOffset(e.before,e.after,fo);e.node.data=e.after;}
 if(edits.length&&saved&&host.contains(anchor)&&host.contains(focus)){
  if(selection.setBaseAndExtent)selection.setBaseAndExtent(anchor,a,focus,f);
  else {const range=doc.createRange();range.setStart(anchor,a);range.setEnd(focus,f);selection.removeAllRanges();selection.addRange(range);}
 }
}
export function validateNumberField(field) {
 const raw=field.value.replace(/,/g,''),n=numberValue(raw),min=field.getAttribute('min'),max=field.getAttribute('max'),step=field.getAttribute('step')||'1';
 let error='';
 if(raw && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)||!Number.isFinite(n)))error='Enter a valid number.';
 else if(raw&&min!==null&&n<Number(min))error='Minimum: '+min;
 else if(raw&&max!==null&&n>Number(max))error='Maximum: '+max;
 else if(raw&&step!=='any'&&Number(step)>0){const units=(n-Number(min||0))/Number(step);if(Math.abs(units-Math.round(units))>Math.max(1e-7,Math.abs(units)*Number.EPSILON*4))error='Use increments of '+step+'.';}
 field.setCustomValidity(error);return !error;
}
export function installNumberFormatting(doc) {
 const mixedIds=new Set(['twiceTransactionInput','printingTransactionInput','gcashCustomAmount','moneyFlowTransactionInput','testTransactionInput','rentalTransactionInput','cfhNotesTitle']);
 function apply(target,event) {
  if(event?.isComposing||!target?.matches)return;
  if(target.matches('[data-cfh-number]')){formatTextField(target);validateNumberField(target);}
  else if(target.matches('textarea')||mixedIds.has(target.id))formatTextField(target,true);
  else if(target.matches('[contenteditable="true"]'))formatRichText(target);
 }
 doc.addEventListener('beforeinput',e=>{
  const field=e.target;
  if(e.isComposing||e.inputType!=='deleteContentBackward'||!field?.matches?.('[data-cfh-number],textarea')&&!mixedIds.has(field?.id))return;
  const p=field.selectionStart;if(p===field.selectionEnd&&p>1&&field.value[p-1]===','&&e.cancelable){
   e.preventDefault();field.setRangeText('',p-2,p,'end');field.setSelectionRange(p-2,p-2);field.dispatchEvent(new doc.defaultView.InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
  }
 },true);
 doc.addEventListener('input',e=>apply(e.target,e),true);
 doc.addEventListener('compositionend',e=>apply(e.target),true);
 doc.addEventListener('focusin',e=>apply(e.target));
 doc.addEventListener('reset',e=>{for(const field of e.target.querySelectorAll('[data-cfh-number]'))field.setCustomValidity('');});
 doc.addEventListener('formdata',e=>{for(const field of e.target.querySelectorAll('[data-cfh-number][name]'))e.formData.set(field.name,field.value.replace(/,/g,''));});
}
if(typeof document!=='undefined')installNumberFormatting(document);
