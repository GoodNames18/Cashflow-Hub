// Keep the modal and backdrop in place until the closing animation has finished.
export function createSheetDismissal(sheet) {
 const win=sheet.ownerDocument.defaultView;
 let closing=false,timer;
 function cancel(){closing=false;win.clearTimeout(timer);sheet.classList.remove('is-closing');}
 function finish(){if(!closing)return;cancel();if(sheet.open)sheet.close();}
 sheet.addEventListener('animationend',event=>{if(event.target===sheet&&event.animationName==='cfhNoteSheetOut')finish();});
 sheet.addEventListener('close',cancel);
 return {
  cancel,
  dismiss(){
   if(!sheet.open||closing)return;
   if(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches){sheet.close();return;}
   closing=true;sheet.classList.add('is-closing');timer=win.setTimeout(finish,220);
  }
 };
}
