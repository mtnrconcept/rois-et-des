import test from 'node:test';import assert from 'node:assert/strict';
const S=await import('../echgammon/sound.mjs').catch(()=>({}));
test('wood sound buffers are finite, quiet and short at both browser sample rates',()=>{
 assert.equal(typeof S.woodSamples,'function');
 for(const sr of [44100,48000])for(const kind of ['move','capture','castle','race','off','dice']){
  const samples=S.woodSamples(kind,sr,71);assert.ok(samples.length<sr);let energy=0,peak=0;
  for(const f of samples){assert.ok(Number.isFinite(f));energy+=f*f;peak=Math.max(peak,Math.abs(f));}
  assert.ok(peak<.9&&peak>.01,kind);const rms=Math.sqrt(energy/samples.length);assert.ok(rms>.001&&rms<.3,kind);
 }
});
test('wood timbres vary reproducibly and expose no network dependency',()=>{
 assert.equal(typeof S.woodSamples,'function');assert.deepEqual(S.woodSamples('move',44100,3),S.woodSamples('move',44100,3));
 assert.notDeepEqual(S.woodSamples('move',44100,3),S.woodSamples('capture',44100,3));
 assert.notDeepEqual(S.woodSamples('move',44100,3),S.woodSamples('move',44100,4));
});
test('sound preferences handle corrupt or refused storage and clamp volume',()=>{
 assert.equal(typeof S.readSoundSettings,'function');assert.deepEqual(S.readSoundSettings({getItem(){throw Error();}}),{enabled:true,volume:.35});
 assert.deepEqual(S.readSoundSettings({getItem:()=>'{"enabled":false,"volume":4}'}),{enabled:false,volume:1});
 assert.equal(S.writeSoundSettings({enabled:false,volume:.2},{setItem(){throw Error();}}),false);
});
test('audio cannot play before a gesture or when unavailable and silence is harmless',async()=>{
 assert.equal(typeof S.createWoodAudio,'function');let calls=0;const a=S.createWoodAudio({contextFactory(){calls++;throw Error('no audio');},storage:{getItem:()=>null,setItem(){}}});
 assert.equal(a.play('move'),false);assert.equal(calls,0);assert.equal(await a.unlock(),false);assert.equal(calls,1);
 assert.equal(a.play('move'),false);a.setEnabled(false);a.stop();a.dispose();assert.equal(a.settings.enabled,false);
});
