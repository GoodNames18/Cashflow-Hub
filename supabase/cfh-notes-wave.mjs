// Microphone monitoring only: never route the input to the speakers.
export function startRecordingWave(canvas,stream,env=window){
 let context,source,analyser,frame,stopped=false;
 const paint=canvas.getContext('2d');
 function baseline(){if(!paint)return;paint.clearRect(0,0,canvas.width,canvas.height);paint.fillStyle='#00896b';paint.fillRect(8,canvas.height/2-1,canvas.width-16,2);}
 baseline();
 function stop(){
  stopped=true;if(frame)env.cancelAnimationFrame(frame);frame=null;
  try{source?.disconnect();analyser?.disconnect();}catch{}
  if(context&&context.state!=='closed')void context.close().catch(()=>{});
  baseline();
 }
 const Audio=env.AudioContext||env.webkitAudioContext;
 if(!Audio||!paint)return stop;
 try{
  context=new Audio();analyser=context.createAnalyser();analyser.fftSize=256;
  source=context.createMediaStreamSource(stream);source.connect(analyser);
  const samples=new Uint8Array(analyser.fftSize);
  const draw=()=>{
   if(stopped)return;analyser.getByteTimeDomainData(samples);
   paint.clearRect(0,0,canvas.width,canvas.height);paint.fillStyle='#00896b';
   const bars=48,step=(canvas.width-16)/bars;
   for(let bar=0;bar<bars;bar++){
    const from=Math.floor(bar*samples.length/bars),to=Math.floor((bar+1)*samples.length/bars);let peak=0;
    for(let i=from;i<to;i++)peak=Math.max(peak,Math.abs(samples[i]-128)/128);
    const height=Math.max(2,Math.min(canvas.height-12,peak*(canvas.height-12)*2));
    paint.fillRect(8+bar*step,(canvas.height-height)/2,Math.max(2,step-4),height);
   }
   frame=env.requestAnimationFrame(draw);
  };
  if(context.state==='suspended')void context.resume().then(()=>{if(!stopped)draw();}).catch(stop);else draw();
 }catch{stop();}
 return stop;
}
