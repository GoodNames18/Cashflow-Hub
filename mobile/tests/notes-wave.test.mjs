import test from 'node:test';
import assert from 'node:assert/strict';
import {startRecordingWave} from '../../supabase/cfh-notes-wave.mjs';
test('waveform uses microphone samples and releases monitoring on stop',()=>{
 const rects=[],frames=new Map();let disconnected=0,closed=0;
 const canvas={width:600,height:128,getContext:()=>({clearRect(){},fillRect(...args){rects.push(args);}})};
 const analyser={fftSize:0,getByteTimeDomainData(buffer){buffer.fill(128);buffer[0]=200;},disconnect(){disconnected++;}};
 class Audio{state='running';createAnalyser(){return analyser;}createMediaStreamSource(stream){assert.equal(stream,'microphone');return {connect:target=>assert.equal(target,analyser),disconnect(){disconnected++;}};}close(){closed++;this.state='closed';return Promise.resolve();}}
 const stop=startRecordingWave(canvas,'microphone',{AudioContext:Audio,requestAnimationFrame:fn=>{frames.set(1,fn);return 1;},cancelAnimationFrame:id=>frames.delete(id)});
 assert.equal(rects.length,49);assert(rects[1][3]>rects[2][3]);assert.equal(frames.size,1);
 stop();assert.equal(frames.size,0);assert.equal(disconnected,2);assert.equal(closed,1);
});
test('recording can continue without Web Audio support',()=>{
 const stop=startRecordingWave({width:600,height:128,getContext:()=>null},'stream',{});assert.doesNotThrow(stop);
});
