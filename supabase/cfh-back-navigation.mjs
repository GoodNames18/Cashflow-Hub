// One native Back decision: dismiss the current layer, return Home, then minimize.
export function createAppBackHandler({document,window,getPage,goHome,legacy=[]}){
 const visible=node=>!!node&&!node.hidden&&!node.closest('[hidden]')&&node.getClientRects().length>0;
 return function handleAppBack(){
  for(const name of ['cfhHandleWatchlistBack','cfhHandleNotesBack','cfhHandlePortfolioBack'])if(window[name]?.())return true;
  const layers=legacy.map(([id,close],order)=>({node:document.getElementById(id),close,order})).filter(x=>visible(x.node));
  layers.sort((a,b)=>(Number(window.getComputedStyle(b.node).zIndex)||0)-(Number(window.getComputedStyle(a.node).zIndex)||0)||b.order-a.order);
  if(layers.length){layers[0].close();return true;}
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){const event=new window.Event('cancel',{cancelable:true});if(dialog.dispatchEvent(event))dialog.close();return true;}
  for(const [id,trigger] of [['cfhNotesSortMenu','cfhNotesSortButton'],['cfhHoldingSortMenu','cfhHoldingSort']]){const menu=document.getElementById(id);if(visible(menu)){menu.hidden=true;document.getElementById(trigger)?.setAttribute('aria-expanded','false');return true;}}
  // Unknown modal layers must never cause the app to exit or bypass a save guard.
  if([...document.querySelectorAll('[aria-modal="true"]')].some(visible)){document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;}
  if(getPage()!=='gcash'){goHome();return true;}
  return false;
 };
}
