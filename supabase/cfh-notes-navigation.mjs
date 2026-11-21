// Keep the search controls available at the current scroll position after scrolling stops.
export function installNotesSearchScroll(page,{window:win=page.ownerDocument.defaultView,delay=180}={}){
 const head=page.querySelector('.cfh-notes-head'),doc=page.ownerDocument;
 const spacer=doc.createElement('div');spacer.className='cfh-notes-head-spacer';spacer.setAttribute('aria-hidden','true');head.before(spacer);
 const measure=()=>{spacer.hidden=head.hidden;spacer.style.height=((head.offsetHeight||54)+20)+'px';};
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
