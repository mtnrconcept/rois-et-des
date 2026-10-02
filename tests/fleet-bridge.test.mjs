import test from 'node:test';
import assert from 'node:assert/strict';
import {createFleetBridge,watchFleetContextLoss} from '../echgammon/fleet-bridge.mjs';
import {createGame,actions,play} from '../echgammon/game.mjs';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function mockRenderer(animation=Promise.resolve()){
  return {states:[],transitions:[],disposed:0,resizes:0,cameras:[],
    sync(value){this.states.push(value);},animate(value){this.transitions.push(value);return animation;},
    dispose(){this.disposed++;},resize(){this.resizes++;},setCamera(mode){this.cameras.push(mode);}};
}

test('current WebGL context loss reports once without changing the canonical hybrid state',()=>{
  const mount=new EventTarget(),game=createGame(),before=JSON.stringify(game);let failures=0;
  const detach=watchFleetContextLoss(mount,{isCurrent:()=>true,onFailure:()=>{failures++;}});
  const event=new Event('webglcontextlost',{cancelable:true});mount.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);assert.equal(failures,1);
  mount.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(failures,1);
  assert.equal(JSON.stringify(game),before);detach();
});

test('obsolete or cleaned-up WebGL instances cannot trigger a fallback in the new view',()=>{
  const staleMount=new EventTarget(),newMount=new EventTarget();let generation=1,failures=0;
  const oldGeneration=generation;
  const detachOld=watchFleetContextLoss(staleMount,{isCurrent:()=>generation===oldGeneration,onFailure:()=>{failures++;}});
  generation++;
  staleMount.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(failures,0);
  const detachNew=watchFleetContextLoss(newMount,{isCurrent:()=>true,onFailure:()=>{failures++;}});
  detachOld();detachNew();
  newMount.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(failures,0);
});

test('fleet attaches to the authoritative hybrid state without changing it',()=>{
  const game=createGame(),original=JSON.stringify(game),state={game,selected:null,available:actions(game)};
  const bridge=createFleetBridge({getState:()=>state}),view=mockRenderer();
  bridge.attach(view);
  assert.equal(bridge.active,true);assert.equal(view.states[0],state);
  assert.equal(JSON.stringify(game),original);
  bridge.resize();bridge.setCamera('chess');assert.equal(view.resizes,1);assert.deepEqual(view.cameras,['chess']);
  bridge.dispose();assert.equal(view.disposed,1);assert.equal(bridge.active,false);
});

test('one legal hybrid action yields one transition and an interaction lock until completion',async()=>{
  const before=createGame();before.phase='play';before.dice=[2,3];before.used=[false,false];
  const action=actions(before).find(a=>a.type==='chess'&&a.from===12&&a.to===28);
  assert.ok(action);const after=play(before,action.id),gate=deferred(),busy=[];
  let snapshot={game:before,selected:null,available:actions(before)};
  const view=mockRenderer(gate.promise),bridge=createFleetBridge({getState:()=>snapshot,onBusy:v=>busy.push(v)});
  bridge.attach(view);snapshot={game:after,selected:null,available:actions(after)};
  const pending=bridge.animate({before,after,action});
  assert.equal(bridge.busy,true);assert.deepEqual(busy,[true]);
  bridge.sync();assert.equal(view.states.length,1,'after must not overwrite the moving scene');
  assert.equal(view.transitions.length,1);assert.equal(view.transitions[0].before,before);assert.equal(view.transitions[0].after,after);
  await assert.rejects(bridge.animate({before,after,action}),/déjà en cours/);
  gate.resolve();assert.equal(await pending,true);
  assert.deepEqual(busy,[true,false]);assert.equal(bridge.busy,false);assert.equal(view.states.at(-1),snapshot);
  assert.equal(before.chess.board[12],'wP');assert.equal(after.chess.board[28],'wP');
});

test('reset or mode replacement invalidates an old animation completion',async()=>{
  const oldGate=deferred(),nextGate=deferred(),busy=[];
  let snapshot={game:createGame(),selected:null,available:[]};
  const bridge=createFleetBridge({getState:()=>snapshot,onBusy:v=>busy.push(v)}),oldView=mockRenderer(oldGate.promise),newView=mockRenderer(nextGate.promise);
  bridge.attach(oldView);const oldRun=bridge.animate({before:snapshot.game,after:snapshot.game,action:{type:'race'}});
  snapshot={game:createGame(),selected:{type:'chess',from:1},available:[]};
  bridge.attach(newView);assert.equal(oldView.disposed,1);assert.equal(newView.states.at(-1),snapshot);
  const newRun=bridge.animate({before:snapshot.game,after:snapshot.game,action:{type:'chess'}});
  oldGate.resolve();assert.equal(await oldRun,false);assert.equal(bridge.busy,true,'stale finally must not unlock the new animation');
  nextGate.resolve();assert.equal(await newRun,true);assert.equal(bridge.busy,false);
  assert.deepEqual(busy,[true,false,true,false]);assert.equal(oldView.states.length,1);
});

test('switching to 2D disposes once and ignores a pending renderer result',async()=>{
  const gate=deferred(),errors=[],view=mockRenderer(gate.promise);
  const bridge=createFleetBridge({getState:()=>({game:createGame()}),onError:e=>errors.push(e)});
  bridge.attach(view);const pending=bridge.animate({before:{},after:{},action:{}});
  bridge.dispose();bridge.dispose();gate.reject(new Error('obsolete graphics job'));
  assert.equal(await pending,false);assert.equal(bridge.active,false);assert.equal(bridge.busy,false);
  assert.equal(view.disposed,1);assert.deepEqual(errors,[]);
});

test('animation failure cannot roll back or mutate an already committed game',async()=>{
  const game=createGame(),snapshot={game,selected:null,available:[]},errors=[],gate=deferred();
  const bridge=createFleetBridge({getState:()=>snapshot,onError:error=>errors.push(error.message)}),view=mockRenderer(gate.promise);
  bridge.attach(view);const before=JSON.stringify(game),pending=bridge.animate({before:game,after:game,action:{type:'race'}});
  gate.reject(new Error('WebGL context lost'));assert.equal(await pending,false);
  assert.deepEqual(errors,['WebGL context lost']);assert.equal(bridge.busy,false);assert.equal(view.states.at(-1),snapshot);
  assert.equal(JSON.stringify(game),before);
});

test('a renderer sync error reports a presentation failure',()=>{
  const errors=[],bridge=createFleetBridge({getState:()=>({game:createGame()}),onError:e=>errors.push(e.message)});
  bridge.attach({sync(){throw new Error('asset unavailable');},dispose(){}});
  assert.deepEqual(errors,['asset unavailable']);assert.equal(bridge.busy,false);
});

test('camera or viewport failures report errors without escaping into game controls',()=>{
  const game=createGame(),before=JSON.stringify(game),errors=[];
  const bridge=createFleetBridge({getState:()=>({game}),onError:e=>errors.push(e.message)});
  bridge.attach({sync(){},dispose(){},resize(){throw new Error('lost drawing surface');},setCamera(){throw new Error('camera unavailable');}});
  assert.doesNotThrow(()=>bridge.resize());assert.doesNotThrow(()=>bridge.setCamera('chess'));
  assert.deepEqual(errors,['lost drawing surface','camera unavailable']);assert.equal(JSON.stringify(game),before);
});

test('the untouched 2D path has no renderer or animation delay',async()=>{
  const bridge=createFleetBridge({getState:()=>{throw new Error('should not read without a renderer');}});
  bridge.sync();bridge.resize();bridge.setCamera('overview');
  assert.equal(await bridge.animate({before:{},after:{},action:{}}),false);assert.equal(bridge.busy,false);
});

test('dice playback shares the interaction lock and preserves cancellation',async()=>{
  const game=createGame(),gate=deferred(),calls=[],bridge=createFleetBridge({getState:()=>({game})});
  bridge.attach({sync(){},dispose(){},animateDice(payload){calls.push(payload);return gate.promise;}});
  const payload={result:{values:[2,5]}},pending=bridge.animateDice(payload);
  assert.equal(bridge.busy,true);assert.equal(calls[0],payload);
  await assert.rejects(bridge.animate({}),/déjà en cours/);
  gate.resolve(false);assert.equal(await pending,false);assert.equal(bridge.busy,false);
  assert.equal(game.revision,0,'presentation cannot commit dice to the rules engine');
});
