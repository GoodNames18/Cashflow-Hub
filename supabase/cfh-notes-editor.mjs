import {normalizeNoteContent,readNoteContent} from './cfh-notes-content.mjs';

export function createNoteFlow(host,{changed}){
 let move=null;
 const selection=()=>window.getSelection?.();
 const inside=range=>range&&host.contains(range.commonAncestorContainer);
 function caretAfter(node){
  const range=document.createRange();range.setStartAfter(node);range.collapse(true);
  const s=selection();s?.removeAllRanges();s?.addRange(range);
 }
 function cancelMove(){
  if(!move)return false;
  const old=move;move=null;if(old.frame)cancelAnimationFrame(old.frame);
  old.atom.classList.remove('is-moving');old.ghost?.remove();old.marker?.remove();return true;
 }
 function rangeAt(x,y){
  let range=document.caretRangeFromPoint?.(x,y);
  if(!range&&document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);range.collapse(true);}}
  if(!inside(range))return null;
  const node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
  const atom=node?.closest?.('[data-audio-id]');
  if(atom){range=document.createRange();const r=atom.getBoundingClientRect();if(x<r.left+r.width/2)range.setStartBefore(atom);else range.setStartAfter(atom);range.collapse(true);}
  return range;
 }
 function updateMove(x,y){
  if(!move)return;
  if(!move.active&&Math.hypot(x-move.x,y-move.y)<4)return;
  if(!move.active){
   move.active=true;move.atom.classList.add('is-moving');
   move.ghost=move.atom.cloneNode(true);move.ghost.classList.add('cfh-note-audio-ghost');move.ghost.setAttribute('aria-hidden','true');move.ghost.removeAttribute('data-audio-id');
   move.ghost.style.width=move.atom.getBoundingClientRect().width+'px';
   move.marker=document.createElement('span');move.marker.className='cfh-note-audio-drop-marker';move.marker.setAttribute('aria-hidden','true');document.body.append(move.ghost,move.marker);
  }
  move.lastX=x;move.lastY=y;move.range=rangeAt(x,y);
  move.ghost.style.left=(x+12)+'px';move.ghost.style.top=(y-20)+'px';
  move.marker.hidden=!move.range;
  if(move.range){const r=move.range.getBoundingClientRect();Object.assign(move.marker.style,{left:r.left+'px',top:r.top+'px',height:Math.max(24,r.height)+'px'});}
 }
 function finishMove(commit){
  if(!move)return;const {atom,active,range}=move;cancelMove();
  if(commit&&active&&inside(range)&&!atom.contains(range.startContainer)){
   range.insertNode(atom);caretAfter(atom);changed();
  }
 }
 function bindAudio(atom){
  atom.setAttribute('contenteditable','false');atom.dataset.audioId=atom.dataset.audioId||'';
  const grip=document.createElement('button');grip.type='button';grip.className='cfh-note-audio-grip';grip.textContent='⠿';grip.setAttribute('aria-label','Drag to move recording');grip.title='Drag to move recording';grip.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight');atom.prepend(grip);
  grip.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.preventDefault();cancelMove();
   move={atom,pointer:e.pointerId,x:e.clientX,y:e.clientY};grip.setPointerCapture?.(e.pointerId);
   const scroll=()=>{if(!move)return;if(move.active){const area=host.closest('.cfh-note-editor-content'),r=area.getBoundingClientRect(),y=move.lastY;
    const dy=y<r.top+35?-10:y>r.bottom-35?10:0;if(dy){area.scrollTop+=dy;updateMove(move.lastX,move.lastY);}}
    move.frame=requestAnimationFrame(scroll);};move.frame=requestAnimationFrame(scroll);
  });
  grip.addEventListener('pointermove',e=>{if(move?.pointer===e.pointerId){e.preventDefault();updateMove(e.clientX,e.clientY);}});
  grip.addEventListener('pointerup',e=>{if(move?.pointer===e.pointerId){e.preventDefault();finishMove(true);}});
  grip.addEventListener('pointercancel',()=>finishMove(false));grip.addEventListener('lostpointercapture',()=>finishMove(false));
  grip.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
   const target=e.key==='ArrowLeft'?atom.previousSibling:atom.nextSibling;if(!target)return;
   if(e.key==='ArrowLeft')target.before(atom);else target.after(atom);changed();grip.focus();
  });
  atom.addEventListener('dragstart',e=>e.preventDefault());
 }
 host.addEventListener('input',e=>{if(!e.target.closest?.('[data-audio-id]'))changed();});
 host.addEventListener('compositionend',()=>changed());
 host.addEventListener('paste',e=>{
  e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';
  // insertText preserves the native keyboard's undo stack and caret.
  const s=selection(),r=s?.rangeCount?s.getRangeAt(0):null;if(!inside(r))return;
  if(!r.collapsed&&[...host.querySelectorAll('[data-audio-id]')].some(n=>r.intersectsNode(n)))return;
  if(document.execCommand?.('insertText',false,text))return;
  r.deleteContents();const n=document.createTextNode(text);r.insertNode(n);caretAfter(n);changed();
 });
 host.addEventListener('beforeinput',e=>{
  if(e.inputType?.startsWith('format')){e.preventDefault();return;}
  if(e.inputType==='insertFromDrop'){e.preventDefault();return;}
  const s=selection(),r=s?.rangeCount?s.getRangeAt(0):null;if(!inside(r))return;
  if(!r.collapsed){if([...host.querySelectorAll('[data-audio-id]')].some(n=>r.intersectsNode(n)))e.preventDefault();return;}
  if(!e.inputType?.startsWith('delete'))return;
  const backwards=e.inputType.includes('Backward'),node=r.startContainer,offset=r.startOffset;
  const adjacent=node.nodeType===3?(backwards&&offset===0?node.previousSibling:!backwards&&offset===node.length?node.nextSibling:null):node.childNodes[backwards?offset-1:offset];
  if(adjacent?.dataset?.audioId)e.preventDefault();
 });
 host.addEventListener('keydown',e=>{if(e.key==='Escape'&&cancelMove()){e.preventDefault();e.stopPropagation();}});
 window.addEventListener('blur',cancelMove);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelMove();});
 return {
  bindAudio,cancelMove,
  read:attachments=>normalizeNoteContent(readNoteContent(host),attachments),
  focusEnd(){host.focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(host);r.collapse(false);const s=selection();s?.removeAllRanges();s?.addRange(r);},
 };
}
