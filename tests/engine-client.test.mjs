import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,roll,actions} from '../echgammon/game.mjs';
const M=await import('../echgammon/engine-client.mjs').catch(()=>({}));
const state=()=>roll(createGame(),[3,2]);
function fake(){let message;return {postMessage(m){message=m;},terminate(){this.stopped=true;},get sent(){return message;},stopped:false};}
test('client sends state to a worker and resolves only its matching request',async()=>{
 assert.equal(typeof M.createEngineClient,'function');const w=fake(),c=M.createEngineClient({workerFactory:()=>w});const g=state(),p=c.analyze(g,{timeMs:100});
 w.onmessage({data:{requestId:'wrong',type:'result',result:{actionId:'bad'}}});
 w.onmessage({data:{requestId:w.sent.requestId,type:'result',result:{revision:g.revision,key:w.sent.key,actionId:actions(g)[0].id}}});
 const r=await p;assert.equal(r.actionId,actions(g)[0].id);assert.equal(w.stopped,true);
});
test('cancellation terminates a running worker and rejects its result',async()=>{
 assert.equal(typeof M.createEngineClient,'function');const w=fake(),c=M.createEngineClient({workerFactory:()=>w});const p=c.analyze(state(),{timeMs:100});
 const expected=assert.rejects(p,{name:'AbortError'});c.cancel();await expected;assert.equal(w.stopped,true);
});
test('worker unavailability gives an explicitly labelled bounded legal fallback',async()=>{
 assert.equal(typeof M.createEngineClient,'function');const c=M.createEngineClient({workerFactory(){throw Error('unsupported');}}),g=state();
 const r=await c.analyze(g,{timeMs:1});assert.equal(r.fallback,true);assert.ok(actions(g).some(a=>a.id===r.actionId));
});
test('worker failure gives a legal fallback rather than blocking the game',async()=>{
 assert.equal(typeof M.createEngineClient,'function');const w=fake(),c=M.createEngineClient({workerFactory:()=>w}),g=state(),p=c.analyze(g,{timeMs:10});
 w.onerror({preventDefault(){}});const r=await p;assert.equal(r.fallback,true);assert.ok(actions(g).some(a=>a.id===r.actionId));
});
