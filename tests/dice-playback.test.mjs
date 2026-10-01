import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '../assets/fleet/vendor/three.module.js';
import {playDiceFrames} from '../echgammon/dice-visuals.mjs';
import {simulateDice,readUpperFace} from '../echgammon/dice-physics.mjs';

const result=simulateDice({seed:42});

function animationClock(t){
  const previous=new Map(['requestAnimationFrame','cancelAnimationFrame'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const callbacks=new Map();let nextId=0;
  globalThis.requestAnimationFrame=callback=>{const id=++nextId;callbacks.set(id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
  t.after(()=>{
    for(const [name,descriptor] of previous){
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
    }
  });
  return {
    get pending(){return callbacks.size;},
    get next(){return callbacks.values().next().value;},
    step(time){const current=[...callbacks.values()];callbacks.clear();for(const callback of current)callback(time);}
  };
}

function presentation(){
  const dice=[0,1].map(()=>({position:new Vector3(),quaternion:new Quaternion()}));
  return {dice,setFrame(frame){frame.dice.forEach((pose,index)=>{
    dice[index].position.fromArray(pose.position);dice[index].quaternion.fromArray(pose.quaternion);
  });}};
}

function transforms(visuals){
  return visuals.dice.map(die=>({position:die.position.toArray(),quaternion:die.quaternion.toArray()}));
}

test('normal playback completes on the actual settled transforms and upper faces',async t=>{
  const clock=animationClock(t),visuals=presentation(),hits=[];let draws=0;
  const pending=playDiceFrames({result,visuals,draw:()=>draws++,onCollision:hit=>hits.push(hit)});
  assert.equal(clock.pending,1);
  clock.step(0);
  assert.deepEqual(transforms(visuals),result.frames[0].dice);
  clock.step(result.duration*1000);
  assert.equal(clock.pending,1,'settled dice remain visible for the final pause');
  clock.step(result.duration*1000+600);
  assert.equal(await pending,true);
  assert.deepEqual(transforms(visuals),result.frames.at(-1).dice);
  assert.deepEqual(visuals.dice.map(die=>readUpperFace(die.quaternion.toArray()).value),result.values);
  assert.deepEqual(hits,result.collisions.filter(hit=>hit.speed>.6),'each audible collision is delivered exactly once');
  assert.ok(draws>=3);assert.equal(clock.pending,0);
});

test('a render exception rejects playback and leaves no scheduled animation',async t=>{
  const clock=animationClock(t),visuals=presentation(),controller=new AbortController();
  const error=new Error('Drawing surface lost');let draws=0;
  const pending=playDiceFrames({result,visuals,signal:controller.signal,draw(){draws++;throw error;}});
  const rejected=assert.rejects(pending,actual=>actual===error);
  const staleFrame=clock.next;
  assert.doesNotThrow(()=>clock.step(0),'the RAF callback must route errors to its promise');
  await rejected;assert.equal(clock.pending,0);
  controller.abort();staleFrame(1000);
  assert.equal(draws,1,'neither later abort nor a stale callback restarts failed playback');
});

test('an impact callback exception also rejects playback without a lock',async t=>{
  const clock=animationClock(t),visuals=presentation(),error=new Error('Audio unavailable');
  const pending=playDiceFrames({result,visuals,draw(){},onCollision(){throw error;}});
  const rejected=assert.rejects(pending,actual=>actual===error);
  clock.step(0);
  assert.doesNotThrow(()=>clock.step(result.duration*1000));
  await rejected;assert.equal(clock.pending,0);
});

test('abort during playback cancels the next frame and preserves the last visible transform',async t=>{
  const clock=animationClock(t),visuals=presentation(),controller=new AbortController();let draws=0;
  const pending=playDiceFrames({result,visuals,signal:controller.signal,draw:()=>draws++});
  clock.step(0);clock.step(100);
  const before=transforms(visuals),drawsBefore=draws,staleFrame=clock.next;
  controller.abort();
  assert.equal(await pending,false);assert.equal(clock.pending,0);
  staleFrame(result.duration*1000+600);
  assert.deepEqual(transforms(visuals),before);assert.equal(draws,drawsBefore);
});

test('an already aborted signal schedules no animation or rendering',async t=>{
  const clock=animationClock(t),controller=new AbortController();controller.abort();
  const completed=await playDiceFrames({result,visuals:presentation(),signal:controller.signal,draw(){assert.fail('cancelled playback must not render');}});
  assert.equal(completed,false);assert.equal(clock.pending,0);
});

test('reduced motion shows the same physical final faces without impact playback',async t=>{
  const clock=animationClock(t),visuals=presentation();
  const pending=playDiceFrames({result,visuals,reducedMotion:true,draw(){},onCollision(){assert.fail('reduced motion suppresses the impact replay');}});
  clock.step(0);
  assert.deepEqual(transforms(visuals),result.frames.at(-1).dice);
  clock.step(200);
  assert.equal(await pending,true);assert.equal(clock.pending,0);
  assert.deepEqual(visuals.dice.map(die=>readUpperFace(die.quaternion.toArray()).value),result.values);
});
