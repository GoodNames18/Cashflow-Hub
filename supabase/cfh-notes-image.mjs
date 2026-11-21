import {nameTotals} from './cfh-notes-tools.mjs';
import {noteContent} from './cfh-notes-content.mjs';
import {displayNoteMath,checklistMathResults,displayMathResults} from './cfh-notes-math.mjs';

const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// Render from note data so offscreen rows are included and editor controls never appear.
export async function createNoteImage(note,background,loadMedia){
 const width=480,pad=24,commands=[],probe=document.createElement('canvas'),ctx=probe.getContext('2d');
 if(!ctx)throw Error('Image export is unavailable.');
 let y=pad,ticks=0;const resources=[];let canvas;
 async function breathe(){if(++ticks%24===0)await pause();}
 try{
 function text(value,format={},indent=0){
  const size=format.size==='h1'?30:format.size==='h2'?25:19,line=size*1.45;
  ctx.font=`${format.i?'italic ':''}${format.b||format.size==='h1'||format.size==='h2'?'700':'400'} ${size}px Arial`;
  const font=ctx.font,max=width-pad*2-indent;
  for(const paragraph of String(value).split('\n')){
   let row='';
   function flush(){commands.push({type:'text',text:row,x:pad+indent,y,font,size,format});y+=line;row='';}
   for(const word of paragraph.split(/(\s+)/)){
    if(ctx.measureText(row+word).width<=max){row+=word;continue;}
    if(row.trim())flush();
    for(const char of word){if(ctx.measureText(row+char).width>max&&row)flush();row+=char;}
   }
   flush();
  }
 }
 if(note.title){text(note.title,{size:'h1',b:true});y+=16;}
 for(const media of note.attachments||[]){
  if(media.type!=='image')continue;
  const blob=await loadMedia(media.id);if(!blob)throw Error('An attached image is unavailable.');
  let image;
  if(typeof createImageBitmap==='function'){
   image=await createImageBitmap(blob,{resizeWidth:width-pad*2,resizeQuality:'medium'});resources.push(()=>image.close());
  }else{
   const url=URL.createObjectURL(blob);image=new Image();resources.push(()=>{image.src='';URL.revokeObjectURL(url);});
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('An attached image could not be read.'));image.src=url;});
  }
  const h=(width-pad*2)*(image.height||image.naturalHeight)/(image.width||image.naturalWidth);
  commands.push({type:'image',image,x:pad,y,w:width-pad*2,h});y+=h+16;await breathe();
 }
 if(note.kind==='list'){
  const totals=nameTotals(note.items),calculations=checklistMathResults(note.items);
  for(const item of note.items||[]){await breathe();if(item.checked||(!item.divider&&!item.text?.trim()))continue;
   if(item.divider){commands.push({type:'divider',y:y+12});y+=28;continue;}
   commands.push({type:'box',x:pad,y:y+4});text(displayMathResults(item.text,calculations.get(item.id))+(totals.has(item.id)?' ('+totals.get(item.id)+')':''),item.format||{},32);y+=10;
  }
 }else{
  // Adjacent spans retain their style and share a line until an explicit newline.
  let x=pad;const lineHeight=44;
  for(const part of noteContent(note)){
   if(part.type==='audio'){if(x!==pad){y+=lineHeight;x=pad;}text('♫ Recording');continue;}
   await breathe();const f=part.format||{},size=f.size==='h1'?30:f.size==='h2'?25:19;
   const font=`${f.i?'italic ':''}${f.b||f.size==='h1'||f.size==='h2'?'700':'400'} ${size}px Arial`;ctx.font=font;
   for(const token of displayNoteMath(part.text||'').split(/(\n|\s+)/)){
    if(token.includes('\n')){for(const c of token){if(c==='\n'){y+=lineHeight;x=pad;}}continue;}
    const tokenWidth=ctx.measureText(token).width;
    if(tokenWidth<=width-pad*2){if(x+tokenWidth>width-pad){y+=lineHeight;x=pad;}commands.push({type:'text',text:token,x,y,font,size,format:f});x+=tokenWidth;}
    else{let run='';const flush=()=>{if(run){commands.push({type:'text',text:run,x,y,font,size,format:f});x+=ctx.measureText(run).width;run='';}};
     for(const char of token){if(x+ctx.measureText(run+char).width>width-pad){flush();y+=lineHeight;x=pad;}run+=char;}flush();}
    await breathe();
   }
  }y+=lineHeight;
 }
 const height=Math.ceil(y+pad),scale=Math.min(1,Math.sqrt(4000000/(width*height)),8192/height);
 if(scale<.5)throw Error('This note is too long for a single image.');
 await pause();canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
 const out=canvas.getContext('2d');if(!out)throw Error('Image export is unavailable.');out.scale(scale,scale);out.fillStyle=background;out.fillRect(0,0,width,height);out.fillStyle='#1e1a42';out.strokeStyle='#1e1a42';out.lineWidth=1.5;out.textBaseline='top';
 for(const c of commands){
  await breathe();
  if(c.type==='image'){out.drawImage(c.image,c.x,c.y,c.w,c.h);continue;}
  if(c.type==='box'){out.strokeRect(c.x,c.y,19,19);continue;}
  if(c.type==='divider'){out.beginPath();out.moveTo(pad,c.y);out.lineTo(width-pad,c.y);out.stroke();continue;}
  out.font=c.font;out.fillText(c.text,c.x,c.y);
  const end=c.x+out.measureText(c.text).width;
  for(const offset of [c.format.u?c.size*1.08:null,c.format.s?c.size*.55:null])if(offset!==null){out.beginPath();out.moveTo(c.x,c.y+offset);out.lineTo(end,c.y+offset);out.stroke();}
 }
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Image encoding took too long. Please try again.')),15000);
  try{canvas.toBlob(blob=>{clearTimeout(timer);if(blob?.size>8)resolve(blob);else reject(Error('The image was empty. No file was saved.'));},'image/png');}
  catch(error){clearTimeout(timer);reject(error);}
 });
 }finally{if(canvas){canvas.width=1;canvas.height=1;}probe.width=1;probe.height=1;for(const release of resources)release();}
}
