import test from 'node:test';
import assert from 'node:assert/strict';
import {actions,isState,play} from '../echgammon/game.mjs';
import * as Game from '../echgammon/game.mjs';
const C=await import('../echgammon/catalog.mjs').catch(()=>({}));
const T=await import('../echgammon/training.mjs').catch(()=>({}));
const P=await import('../echgammon/progress.mjs').catch(()=>({}));
test('academy catalogue exists with 18 exercises, 8 lessons and 6 bots',()=>{
 assert.equal(C.EXERCISES?.length,18);assert.equal(C.LESSONS?.length,8);assert.equal(C.BOTS?.length,6);
});
test('every exercise has a valid starting state and a complete legal solution',()=>{
 assert.equal(typeof T.startTraining,'function');
 for(const e of C.EXERCISES){let s=T.startTraining(e.id);assert.ok(isState(s.game),e.id);for(let i=0;i<e.steps.length;i++){
 const id=T.solutionAction(s);assert.ok(actions(s.game).some(a=>a.id===id),e.id+' step '+i);
 const r=T.attemptTraining(s,id);assert.equal(r.correct,true,e.id);s=r.session;assert.ok(isState(s.game),e.id+' result');
 }assert.equal(s.complete,true,e.id);assert.equal(s.step,e.steps.length);assert.ok(e.hints.length===3);}
});
test('all acceptable branches and payments of every solution remain solvable',()=>{
 assert.equal(typeof T.isExpected,'function');
 for(const e of C.EXERCISES){let frontier=[T.startTraining(e.id)];for(let i=0;i<e.steps.length;i++){
 frontier=frontier.flatMap(s=>{const allowed=actions(s.game).filter(a=>T.isExpected(s,a));assert.ok(allowed.length,e.id);return allowed.map(a=>T.attemptTraining(s,a.id).session);});
 }assert.ok(frontier.every(s=>s.complete));}
});
test('wrong moves retain the position and cannot record a success',()=>{
 assert.equal(typeof T.startTraining,'function');const s=T.startTraining('premier-pas');
 const wrong=actions(s.game).find(a=>!T.isExpected(s,a));assert.ok(wrong);
 const result=T.attemptTraining(s,wrong.id);assert.equal(result.correct,false);assert.deepEqual(result.session.game,s.game);assert.equal(result.session.mistakes,1);assert.equal(result.session.complete,false);
 assert.deepEqual(s.mistakes,0);assert.throws(()=>T.attemptTraining(s,'forged'));
});
test('hints are bounded and solution reveal is marked as assistance',()=>{
 assert.equal(typeof T.revealHint,'function');let s=T.startTraining('premier-pas');for(let i=0;i<9;i++)s=T.revealHint(s);
 assert.equal(s.hintLevel,3);s=T.showSolution(s);assert.equal(s.revealed,true);
 s=T.attemptTraining(s,T.solutionAction(s)).session;assert.equal(T.stars(s),0);assert.equal(s.complete,true);
});
test('lesson references are valid, daily choice is stable, unknown IDs rejected',()=>{
 assert.equal(typeof C.dailyExercise,'function');
 for(const l of C.LESSONS){assert.ok(C.EXERCISES.some(e=>e.id===l.exercise));assert.ok(l.cards.length>=3);}
 assert.equal(C.dailyExercise(new Date('2026-10-01T10:00:00')).id,C.dailyExercise(new Date('2026-10-01T20:00:00')).id);
 assert.throws(()=>T.startTraining('missing'));assert.throws(()=>C.exerciseState('missing'));
});
test('progress starts honestly at zero and tracks best result only once',()=>{
 assert.equal(typeof P.createProgress,'function');let p=P.createProgress();assert.equal(P.summary(p).solved,0);
 p=P.recordExercise(p,'premier-pas',{stars:2,kind:'puzzle'});p=P.recordExercise(p,'premier-pas',{stars:1,kind:'puzzle'});
 assert.equal(P.summary(p).solved,1);assert.equal(p.exercises['premier-pas'].stars,2);
 p=P.recordExercise(p,'premier-pas',{stars:3,kind:'puzzle'});assert.equal(p.exercises['premier-pas'].stars,3);
});
test('corrupt or unavailable storage never prevents learning',()=>{
 assert.equal(typeof P.readProgress,'function');
 for(const raw of ['oops','null','{}','{"version":1,"exercises":{"__proto__":{"stars":99}}}']){
 const p=P.readProgress({getItem:()=>raw});assert.equal(P.summary(p).solved,0);}
 assert.equal(P.summary(P.readProgress({getItem(){throw Error('denied');}})).solved,0);
 assert.equal(P.writeProgress(P.createProgress(),{setItem(){throw Error('quota');}}),false);
});
test('finished games are deduplicated and unfinished outcomes refused',()=>{
 assert.equal(typeof P.recordGame,'function');let p=P.createProgress();
 const result={id:'game-1',bot:'leon',winner:'w',humanSide:'w',reason:'course',turns:120};
 p=P.recordGame(p,result);p=P.recordGame(p,result);assert.equal(p.games.length,1);assert.equal(P.summary(p).wins,1);
 assert.throws(()=>P.recordGame(p,{...result,winner:null}));
});
const A=await import('../echgammon/ai.mjs');
test('six bot profiles always return legal moves and preserve input',()=>{
 assert.equal(typeof A.chooseBot,'function');
 for(const e of C.EXERCISES){const g=C.exerciseState(e.id),before=JSON.stringify(g);for(const bot of C.BOTS){const id=A.chooseBot(g,bot.id,()=>.9);assert.ok(actions(g).some(a=>a.id===id),bot.id+' '+e.id);}assert.equal(JSON.stringify(g),before);}
});
test('all six bots take an available immediate win',()=>{
 assert.equal(typeof A.chooseBot,'function');
 for(const id of ['mat-ivoire','derniere-sortie']){const g=C.exerciseState(id);for(const b of C.BOTS){const n=play(g,A.chooseBot(g,b.id,()=>0));assert.equal(n.winner,'w',b.id+' '+id);}}
});
test('storage getter denial is caught before default arguments are resolved',()=>{
 assert.equal(typeof P.readProgress,'function');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('security');}});
 try{assert.doesNotThrow(()=>P.readProgress());assert.doesNotThrow(()=>P.writeProgress(P.createProgress()));}finally{delete globalThis.localStorage;}
});
test('viewing a lesson solution does not certify a solved lesson',()=>{
 const p=P.recordExercise(P.createProgress(),'premier-pas',{stars:0,kind:'lesson',lesson:'decouvrir'});
 assert.equal(P.summary(p).lessons,0);assert.equal(P.summary(p).solved,0);
 const q=P.recordExercise(p,'premier-pas',{stars:1,kind:'lesson',lesson:'decouvrir'});assert.equal(P.summary(q).lessons,1);
});
test('saved progress rejects duplicate match IDs and malformed collections',()=>{
 const p=P.createProgress();p.games=[{id:'same',bot:'iris',winner:'w',humanSide:'w',date:'2026-10-01',turns:2},{id:'same',bot:'iris',winner:'w',humanSide:'w',date:'2026-10-01',turns:2}];
 assert.equal(P.summary(P.readProgress({getItem:()=>JSON.stringify(p)})).games,0);
 for(const value of [[],3,'invalid']){const bad={...P.createProgress(),exercises:value};assert.equal(P.writeProgress(bad,{setItem(){}}),false);}
});
const Coach=await import('../echgammon/coach.mjs');
test('a local black player gets a hint anchored to the black bar',()=>{
 assert.equal(Coach.sourceTarget({type:'race',from:'bar'},'b'),'#bar-b');
 assert.equal(Coach.sourceTarget({type:'race',from:'bar'},'w'),'#bar-w');
});
for(const bot of C.BOTS)test(`${bot.name} completes a full hybrid game without illegal actions`,()=>{
 let seed=71+bot.rank;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 let g=Game.createGame(),steps=0;
 while(!g.winner&&steps<2200){
  if(g.phase==='opening'||g.phase==='roll')g=Game.roll(g,[1+Math.floor(random()*6),1+Math.floor(random()*6)]);
  else {const id=A.chooseBot(g,bot.id,random);assert.ok(actions(g).some(a=>a.id===id),bot.id);g=play(g,id);}
  assert.ok(isState(g),bot.id);steps++;
 }
 assert.ok(g.winner,bot.id+' must reach a win or the documented draw limit');assert.ok(steps<2200);
});
