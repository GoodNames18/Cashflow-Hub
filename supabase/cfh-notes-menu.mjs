export function selectionMenuPosition(anchor,width,height,viewportWidth,viewportHeight){
 const left=Math.max(8,Math.min(anchor.right-width,viewportWidth-width-8));
 const below=anchor.bottom+6;
 return {left,top:below+height<=viewportHeight-8?below:Math.max(8,anchor.top-height-6)};
}
export function createSelectionMenu(doc){
 const win=doc.defaultView,menu=doc.createElement('dialog');menu.className='cfh-note-selection-menu';menu.id='cfhNoteSelectionMenu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Selected note actions');doc.body.append(menu);
 let trigger=null;
 function reset(){trigger?.setAttribute('aria-expanded','false');trigger=null;}
 function close(){const old=trigger;reset();if(menu.open)menu.close();if(old?.isConnected)old.focus({preventScroll:true});}
 menu.addEventListener('close',()=>{if(!menu.open)reset();});
 menu.addEventListener('click',event=>{if(event.target!==menu)return;const r=menu.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 menu.addEventListener('keydown',event=>{
  const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(doc.activeElement);
  if(!buttons.length)return;let next;
  if(event.key==='ArrowDown')next=(index+1)%buttons.length;else if(event.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;
  event.preventDefault();buttons[next].focus({preventScroll:true});
 });
 win.addEventListener('resize',close);win.addEventListener('scroll',event=>{if(menu.open&&!(event.target?.nodeType&&menu.contains(event.target)))close();},true);
 const style=doc.createElement('style');style.textContent=`
.cfh-note-selection-menu{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:224px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:6px 0;border:1px solid #ded9ee;border-radius:9px;background:#fff;color:#1b1844;box-shadow:0 8px 28px #1b184433}
.cfh-note-selection-menu::backdrop{background:transparent}
.cfh-note-selection-menu button{display:block;box-sizing:border-box;width:100%;min-height:44px;margin:0;padding:11px 18px;border:0;border-radius:0;background:transparent;color:inherit;text-align:left;font:16px/1.4 Arial,sans-serif}
.cfh-note-selection-menu button:hover,.cfh-note-selection-menu button:focus-visible{background:#e9e6fa;outline:none}
.cfh-note-selection-menu button:disabled{opacity:.4;cursor:default}
`;doc.head.append(style);
 return {close,open(anchor,items){
  close();if(!anchor?.isConnected)return;trigger=anchor;anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',menu.id);menu.replaceChildren();
  for(const item of items){const button=doc.createElement('button');button.type='button';button.role='menuitem';button.textContent=item.label;button.disabled=!!item.disabled;button.onclick=()=>{close();item.select();};menu.append(button);}
  menu.showModal();const rect=menu.getBoundingClientRect(),position=selectionMenuPosition(anchor.getBoundingClientRect(),rect.width||224,rect.height||items.length*44+12,win.innerWidth,win.innerHeight);menu.style.left=position.left+'px';menu.style.top=position.top+'px';menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 }};
}
