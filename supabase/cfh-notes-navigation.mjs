// Keep the search controls available at the current scroll position after scrolling stops.
export function installNotesSearchScroll(page,{window:win=page.ownerDocument.defaultView,delay=180}={}){
 const head=page.querySelector('.cfh-notes-head'),doc=page.ownerDocument;
 const spacer=doc.createElement('div');spacer.className='cfh-notes-head-spacer';spacer.setAttribute('aria-hidden','true');head.before(spacer);
 const measure=()=>{spacer.hidden=head.hidden;spacer.style.height=((head.offsetHeight||54)+6)+'px';};
 let timer;
 const show=()=>{win.clearTimeout(timer);head.classList.remove('is-scrolling');head.inert=false;};
 const scroll=event=>{
  const target=event.target;
  if(page.hidden||head.hidden||doc.querySelector('dialog[open]')||doc.body.classList.contains('cfh-notes-editor-open'))return;
  if(target!==win&&target!==doc&&target!==doc.documentElement&&target!==doc.body&&target!==page)return;
  if(head.contains(doc.activeElement))return;
  win.clearTimeout(timer);head.classList.add('is-scrolling');head.inert=true;
  timer=win.setTimeout(show,delay);
 };
 win.addEventListener('scroll',scroll,{capture:true,passive:true});
 head.addEventListener('focusin',show);
 const reset=()=>{show();measure();};
 const observer=new win.MutationObserver(reset);
 observer.observe(page,{attributes:true,attributeFilter:['hidden','class']});
 observer.observe(head,{attributes:true,attributeFilter:['hidden']});
 measure();win.addEventListener('resize',measure);
 return {show,destroy(){spacer.remove();win.removeEventListener('resize',measure);show();observer.disconnect();win.removeEventListener('scroll',scroll,true);head.removeEventListener('focusin',show);}};
}

// Drawer gestures belong to the Notes list, not the editor or another popup.
export function installNotesDrawerGestures(page,drawer,{open,window:win=page.ownerDocument.defaultView,now=Date.now}={}){
 const doc=page.ownerDocument,nativeClose=drawer.close.bind(drawer);let start=null,closing=false,timer,animation,ignoreClickUntil=0;
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const finish=value=>{if(!closing)return;closing=false;win.clearTimeout(timer);nativeClose(value);animation?.cancel();animation=null;drawer.classList.remove('is-closing');};
 drawer.close=value=>{
  if(!drawer.open||closing)return;
  closing=true;
  if(reduced()){finish(value);return;}
  drawer.classList.add('is-closing');
  timer=win.setTimeout(()=>finish(value),240);
  if(drawer.animate){animation=drawer.animate([{transform:'translateX(0)'},{transform:'translateX(-100%)'}],{duration:200,easing:'ease-in',fill:'forwards'});animation.finished.then(()=>finish(value),()=>finish(value));}
 };
 const cancel=event=>{event.preventDefault();drawer.close();};drawer.addEventListener('cancel',cancel);
 const allowed=()=>!page.hidden&&!drawer.open&&!doc.querySelector('dialog[open]')&&!doc.body.classList.contains('cfh-notes-editor-open')&&!doc.body.classList.contains('cfh-note-dragging');
 const down=event=>{start=null;if(!allowed()||event.isPrimary===false||event.button>0||event.target.closest('input,textarea,select,button,a,audio,[contenteditable="true"]'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId,time:now()};};
 const up=event=>{const origin=start;start=null;if(!origin||event.pointerId!==origin.id||!allowed())return;const dx=event.clientX-origin.x,dy=event.clientY-origin.y;if(dx>=64&&Math.abs(dy)<=40&&dx>Math.abs(dy)*1.8&&now()-origin.time<650){ignoreClickUntil=now()+400;open();}};
 const reset=()=>{start=null;};
 const click=event=>{if(now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}};
 page.addEventListener('pointerdown',down);page.addEventListener('pointerup',up);page.addEventListener('pointercancel',reset);page.addEventListener('click',click,true);
 return {destroy(){if(closing)finish();drawer.close=nativeClose;drawer.removeEventListener('cancel',cancel);page.removeEventListener('pointerdown',down);page.removeEventListener('pointerup',up);page.removeEventListener('pointercancel',reset);page.removeEventListener('click',click,true);}};
}
