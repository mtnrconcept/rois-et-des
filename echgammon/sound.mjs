/** Original procedural wood foley: felt friction, resonant knock and contact.
 * No downloads, recording, tracking or audio before a user's gesture.
 */
export const SOUND_KEY='echgammon.sound.v1';
const DEFAULT={enabled:true,volume:.35};
const bounded=(n,fallback=.35)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
function storageOrDefault(storage){try{return storage===undefined?globalThis.localStorage:storage;}catch{return null;}}
export function readSoundSettings(storage){try{const v=JSON.parse(storageOrDefault(storage)?.getItem(SOUND_KEY));return {enabled:typeof v?.enabled==='boolean'?v.enabled:true,volume:bounded(v?.volume)};}catch{return {...DEFAULT};}}
export function writeSoundSettings(settings,storage){try{const target=storageOrDefault(storage);if(!target)return false;target.setItem(SOUND_KEY,JSON.stringify({enabled:Boolean(settings.enabled),volume:bounded(settings.volume)}));return true;}catch{return false;}}
const PROFILES={move:{duration:.23,events:[[.035,1]]},capture:{duration:.34,events:[[.016,.45],[.12,1.15]]},castle:{duration:.4,events:[[.026,1],[.205,.8]]},race:{duration:.2,events:[[.014,.7]]},off:{duration:.27,events:[[.02,.72],[.1,.35]]},dice:{duration:.55,events:[[.01,.55],[.1,.42],[.18,.55],[.29,.32],[.4,.25]]}};
export function woodSamples(kind='move',sampleRate=44100,seed=1){
 const profile=PROFILES[kind]||PROFILES.move,sr=Math.min(96000,Math.max(8000,Number(sampleRate)||44100));
 const result=new Float32Array(Math.ceil(profile.duration*sr));let randomState=(seed>>>0)||1,low=0;
 const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296)*2-1;
 const pitch=1+random()*.07,base=kind==='capture'?265:kind==='race'?510:kind==='dice'?740:350;
 for(let i=0;i<result.length;i++){
  const t=i/sr,noise=random();low+=.15*(noise-low);let value=0;
  // A very short scrape before the contact, not a musical tone.
  if(kind==='move'&&t<.036)value+=low*.11*Math.sin(Math.PI*t/.036);
  for(const [offset,gain] of profile.events){
   const dt=t-offset;if(dt<0)continue;
   const attack=Math.min(1,dt/.0012),body=Math.exp(-dt*34),click=Math.exp(-dt*200);
   const modes=Math.sin(2*Math.PI*base*pitch*dt)*.34+Math.sin(2*Math.PI*base*2.71*pitch*dt)*.17+Math.sin(2*Math.PI*base*5.12*dt)*.08;
   value+=gain*attack*(modes*body+low*.42*Math.exp(-dt*58)+noise*.25*click);
  }
  result[i]=Math.tanh(value)*.8*Math.min(1,(profile.duration-t)/.01);
 }
 return result;
}
export function soundForAction(a){return a.type==='race'?(a.to==='off'?'off':a.hit?'capture':'race'):a.castle?'castle':a.capture?'capture':'move';}
export function createWoodAudio({storage,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){
 let settings=readSoundSettings(storage),ctx=null,master=null,limiter=null,unlocked=false,disposed=false,variation=0;
 const active=new Set(),cache=new Map();
 function stop(){for(const s of active){try{s.stop();}catch{/* Already ended. */}}active.clear();}
 function volume(){if(!master)return;const t=ctx.currentTime;master.gain.cancelScheduledValues(t);master.gain.setTargetAtTime(settings.enabled?settings.volume:0,t,.012);}
 async function unlock(){
  if(disposed||!settings.enabled)return false;
  try{
   if(!ctx){ctx=contextFactory();master=ctx.createGain();master.gain.value=settings.volume;limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=8;master.connect(limiter);limiter.connect(ctx.destination);}
   if(ctx.state!=='running')await ctx.resume();unlocked=ctx.state==='running';return unlocked;
  }catch{unlocked=false;return false;}
 }
 function play(kind='move',pan=0){
  if(disposed||!unlocked||!settings.enabled||settings.volume===0||ctx?.state!=='running')return false;
  try{
   const key=kind+':'+(++variation%5);let buffer=cache.get(key);
   if(!buffer){const data=woodSamples(kind,ctx.sampleRate,variation%5+37);buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);buffer.copyToChannel(data,0);cache.set(key,buffer);}
   while(active.size>=8){const old=active.values().next().value;try{old.stop();}catch{}active.delete(old);}
   const source=ctx.createBufferSource();source.buffer=buffer;
   const panner=ctx.createStereoPanner?.();if(panner){panner.pan.value=Math.max(-.7,Math.min(.7,Number(pan)||0));source.connect(panner);panner.connect(master);}else source.connect(master);
   active.add(source);source.onended=()=>{active.delete(source);try{source.disconnect();panner?.disconnect();}catch{}};source.start();return true;
  }catch{return false;}
 }
 return {unlock,play,stop,get settings(){return {...settings};},get ready(){return unlocked&&ctx?.state==='running';},
  setEnabled(enabled){settings.enabled=Boolean(enabled);if(!settings.enabled)stop();volume();writeSoundSettings(settings,storage);},
  setVolume(v){settings.volume=bounded(Number(v));volume();writeSoundSettings(settings,storage);},
  dispose(){disposed=true;stop();cache.clear();try{ctx?.close()?.catch(()=>{});}catch{}unlocked=false;}
 };
}
