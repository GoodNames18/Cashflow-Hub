// Keep the search controls available at the current scroll position after scrolling stops.
export function installNotesSearchScroll(page,{window:win=page.ownerDocument.defaultView,delay=180}={}){
 const head=page.querySelector('.cfh-notes-head'),doc=page.ownerDocument;
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
 const observer=new win.MutationObserver(show);
 observer.observe(page,{attributes:true,attributeFilter:['hidden','class']});
 observer.observe(head,{attributes:true,attributeFilter:['hidden']});
 return {show,destroy(){show();observer.disconnect();win.removeEventListener('scroll',scroll,true);head.removeEventListener('focusin',show);}};
}
