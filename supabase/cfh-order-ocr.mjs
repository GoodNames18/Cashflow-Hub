export function parseOrderScreenshot(text, symbols){
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 if(!lines.some(l=>/\bOrder Details$/i.test(l))||!lines.some(l=>/\bCompleted\b.*\bBUY\b/i.test(l)))throw Error('Choose an Order Details screenshot for a completed BUY.');
 const numeric='(?:[₱Pp]\\s*)?([0-9][0-9,]*(?:\\.[0-9]+)?)';
 function read(label){
  const row=lines.find(l=>new RegExp('^'+label+'\\s','i').test(l));
  const match=row?.match(new RegExp('(?:^|\\s)'+numeric+'\\s*$'));
  return match?Number(match[1].replaceAll(',','')):undefined;
 }
 const header=lines.slice(lines.findIndex(l=>/\bOrder Details$/i.test(l))+1,lines.findIndex(l=>/^Status\b/i.test(l)));
 const symbol=header.map(l=>l.split(/\s+/)[0]).find(s=>Object.hasOwn(symbols,s));
 const shares=read('Fill Quantity'),price=read('Average Price'),gross=read('Gross Trade Price'),total=read('Total Cost');
 const cents=n=>Math.round(n*100);
 if(!(symbol&&shares>0&&price>0&&gross>0&&total>=gross&&cents(shares*price)===cents(gross)))throw Error('Could not verify the ticker, filled shares, price, or total. Try a clearer screenshot.');
 const fees=(cents(total)-cents(gross))/100,commission=read('Commissions'),other=read('Other Fees');
 if(commission!==undefined&&other!==undefined&&cents(commission+other)!==cents(fees))throw Error('The fees and total don’t match. Try a clearer screenshot.');
 const i=lines.findIndex(l=>/^Order Date\b/i.test(l));
 const match=i>=0?lines[i+1]?.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/):null;
 const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const month=match?months.indexOf(match[1].slice(0,3).toLowerCase())+1:0;
 const date=month?match[3]+'-'+String(month).padStart(2,'0')+'-'+match[2].padStart(2,'0'):'';
 const parsed=new Date(date+'T00:00:00Z');
 if(!date||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)throw Error('Could not verify the order date. Try a clearer screenshot.');
 const broker=['DragonFi Lite (Maya)','DragonFi','COL Financial'].find(b=>lines.some(l=>l.toLowerCase()===b.toLowerCase()));
 return {symbol,shares,price,fees,date,broker};
}
let library;
let reader;
let idleTimer;
let queuedReads=0;
let lastRead=Promise.resolve();
const asset=name=>new URL('./vendor/order-ocr/'+name,import.meta.url).href;

async function createReader(){
 library||=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=asset('tesseract.min.js');
  script.onload=()=>resolve(globalThis.Tesseract);
  script.onerror=()=>{script.remove();reject(Error('Could not load the screenshot reader.'));};
  document.head.append(script);
 }).catch(error=>{library=null;throw error;});
 const tesseract=await library;
 const worker=await tesseract.createWorker('eng',1,{workerPath:asset('worker.min.js'),corePath:asset('tesseract-core-lstm.wasm.js'),langPath:asset(''),workerBlobURL:false});
 try{
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  return worker;
 }catch(error){
  await worker.terminate();
  throw error;
 }
}

function getReader(){
 reader||=createReader().catch(error=>{reader=null;throw error;});
 return reader;
}

function releaseWhenIdle(){
 clearTimeout(idleTimer);
 if(queuedReads||!reader)return;
 idleTimer=setTimeout(()=>{
  const current=reader;
  reader=null;
  void current.then(worker=>worker.terminate()).catch(()=>{});
 },120000);
}

export function warmOrderReader(){
 void getReader().then(releaseWhenIdle,()=>{});
}

async function smallerScreenshot(file){
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,800/bitmap.width,1800/bitmap.height);
  if(scale===1)return null;
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);
  canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 }finally{bitmap.close();}
}

export async function readOrderImage(file,symbols){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12000000)throw Error('Choose a PNG, JPEG, or WebP image under 12 MB.');
 queuedReads++;
 clearTimeout(idleTimer);
 const reduced=smallerScreenshot(file).catch(()=>null);
 const read=lastRead.then(async()=>{
  const [worker,smaller]=await Promise.all([getReader(),reduced]);
  if(smaller){
   const {data}=await worker.recognize(smaller);
   try{return parseOrderScreenshot(data.text,symbols);}
   catch{/* Retry at full resolution when the smaller scan cannot be verified. */}
  }
  const {data}=await worker.recognize(file);
  return parseOrderScreenshot(data.text,symbols);
 });
 lastRead=read.catch(()=>{});
 try{return await read;}
 finally{queuedReads--;releaseWhenIdle();}
}
