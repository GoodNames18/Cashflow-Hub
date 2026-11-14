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
 const match=i>=0?(lines[i].replace(/^Order Date\b/i,'').trim()+' '+(lines[i+1]||'')).trim().match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/):null;
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
let activeReader;
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
 const native=globalThis.CFH_NATIVE===true;
 let rejectStartup;
 const startupError=new Promise((_,reject)=>{rejectStartup=reject;});
 const initialization=tesseract.createWorker('eng',1,{
  workerPath:asset('worker.min.js'),
  corePath:asset('tesseract-core-lstm.wasm.js'),
  langPath:asset(''),
  workerBlobURL:false,
  gzip:!native,
  cacheMethod:native?'none':'write',
  errorHandler:error=>rejectStartup(new Error(String(error)))
 });
 const worker=await Promise.race([initialization,startupError]);
 try{
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  return worker;
 }catch(error){
  await worker.terminate();
  throw error;
 }
}

function discardReader(current){
 if(reader!==current)return;
 reader=null;
 clearTimeout(idleTimer);
 void current.then(worker=>worker.terminate()).catch(()=>{});
}

function getReader(){
 if(!reader){
  const current=createReader().catch(error=>{discardReader(current);throw error;});
  reader=current;
  idleTimer=setTimeout(()=>discardReader(current),15000);
 }
 return reader;
}

function releaseWhenIdle(current){
 if(reader!==current||activeReader===current)return;
 clearTimeout(idleTimer);
 idleTimer=setTimeout(()=>discardReader(current),120000);
}

export function warmOrderReader(){
 if(globalThis.CFH_NATIVE)return;
 const current=getReader();
 void current.then(()=>releaseWhenIdle(current),()=>{});
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

export async function readOrderImage(file,symbols,signal){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12000000)throw Error('Choose a PNG, JPEG, or WebP image under 12 MB.');
 signal.throwIfAborted();
 if(globalThis.CFH_NATIVE){
  const native=globalThis.cfhRecognizeOrderImage;
  if(!native)throw Error('Android screenshot reader is unavailable.');
  const data=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result).split(',')[1]);
   reader.onerror=()=>reject(Error('Could not open the selected screenshot.'));
   reader.readAsDataURL(file);
  });
  signal.throwIfAborted();
  let timeout;
  const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Android screenshot reading timed out. Try again.')),20000);});
  let text;
  try{({text}=await Promise.race([native(data),deadline]));}
  finally{clearTimeout(timeout);}
  signal.throwIfAborted();
  return parseOrderScreenshot(text,symbols);
 }
 if(activeReader)discardReader(activeReader);
 const current=getReader();
 activeReader=current;
 clearTimeout(idleTimer);
 let timeout;
 let cancel;
 const interrupted=new Promise((_,reject)=>{
  cancel=()=>{discardReader(current);reject(signal.reason);};
  signal.addEventListener('abort',cancel,{once:true});
  timeout=setTimeout(()=>{
   discardReader(current);
   reject(Error('Screenshot reading timed out. Try again or enter the order details manually.'));
  },15000);
 });
 function checkScan(){
  signal.throwIfAborted();
  if(reader!==current)throw new DOMException('Screenshot reading ended.','AbortError');
 }
 async function recognize(){
  const [worker,smaller]=await Promise.all([current,smallerScreenshot(file).catch(()=>null)]);
  checkScan();
  if(smaller){
   const {data}=await worker.recognize(smaller);
   checkScan();
   try{return parseOrderScreenshot(data.text,symbols);}
   catch{/* Try the original image if the smaller scan cannot be verified. */}
  }
  const {data}=await worker.recognize(file);
  checkScan();
  return parseOrderScreenshot(data.text,symbols);
 }
 try{return await Promise.race([recognize(),interrupted]);}
 finally{
  clearTimeout(timeout);
  signal.removeEventListener('abort',cancel);
  if(activeReader===current)activeReader=null;
  releaseWhenIdle(current);
 }
}
