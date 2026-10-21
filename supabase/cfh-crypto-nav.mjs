export function createNavReveal({onChange,setTimer=setTimeout,clearTimer=clearTimeout}){
 let active=false,timer;
 function hide(){clearTimer(timer);timer=undefined;onChange(false,active);}
 return {
  setActive(value){if(active===value)return;active=value;hide();},
  reveal(){if(!active)return;clearTimer(timer);onChange(true,true);timer=setTimer(hide,15000);},
  hide
 };
}
export function mountCryptoNav(document,window){
 const nav=document.getElementById('cfhCryptoNav'),main=document.querySelector('.cfh-bottom-nav');if(!nav||!main)return;
 const controller=createNavReveal({onChange(visible,active){
  document.body.classList.toggle('cfh-main-nav-revealed',visible);
  if(active&&!visible&&main.contains(document.activeElement))nav.focus({preventScroll:true});
  main.inert=active&&!visible;
  main.setAttribute('aria-hidden',String(active&&!visible));
 }});
 const sync=()=>controller.setActive(document.body.classList.contains('cfh-crypto-active'));
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});sync();
 let start=null,swiped=false;
 nav.style.touchAction='none';
 nav.addEventListener('touchstart',event=>{const t=event.touches[0];start=t?{x:t.clientX,y:t.clientY}:null;swiped=false;},{passive:true});
 nav.addEventListener('touchmove',event=>{if(!start)return;const t=event.touches[0];if(!t)return;const dy=start.y-t.clientY,dx=Math.abs(start.x-t.clientX);if(Math.abs(dy)>=24&&Math.abs(dy)>dx){swiped=true;event.preventDefault();event.stopPropagation();if(dy>0)controller.reveal();else controller.hide();}},{passive:false});
 nav.addEventListener('touchend',event=>{if(swiped){event.preventDefault();event.stopPropagation();}start=null;},{passive:false});
 nav.addEventListener('touchcancel',()=>{start=null;swiped=false;});
 nav.addEventListener('click',event=>{if(swiped){event.preventDefault();event.stopImmediatePropagation();swiped=false;}},true);
 nav.tabIndex=0;nav.setAttribute('aria-description','Swipe up or press Arrow Up to show the main app navigation for 15 seconds.');
 nav.addEventListener('keydown',event=>{if(event.key==='ArrowUp'){event.preventDefault();controller.reveal();main.querySelector('button')?.focus();}});
 // Interacting with the revealed menu gives another full 15 seconds to choose a destination.
 main.addEventListener('touchstart',()=>controller.reveal(),{passive:true});
 main.addEventListener('focusin',()=>controller.reveal());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)controller.hide();});
}
