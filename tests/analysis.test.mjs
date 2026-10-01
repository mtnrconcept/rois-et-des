import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,roll,actions,play} from '../echgammon/game.mjs';
import {exerciseState} from '../echgammon/catalog.mjs';
const E=await import('../echgammon/analysis.mjs').catch(()=>({}));
const ready=()=>roll(createGame(),[3,2]);
test('analysis exists and its weighted future dice exactly cover 36 outcomes',()=>{
 assert.equal(typeof E.analyze,'function');assert.equal(E.DICE_OUTCOMES.length,21);
 assert.equal(E.DICE_OUTCOMES.reduce((n,r)=>n+r.weight,0),36);
 assert.equal(E.DICE_OUTCOMES.find(r=>r.dice[0]===3&&r.dice[1]===3).weight,1);
 assert.equal(E.DICE_OUTCOMES.find(r=>r.dice[0]===2&&r.dice[1]===5).weight,2);
});
test('a bounded analysis returns a legal move, honest metadata and leaves the state intact',()=>{
 assert.equal(typeof E.analyze,'function');const g=ready(),copy=JSON.stringify(g);
 const r=E.analyze(g,{timeMs:350,maxNodes:1800});assert.equal(JSON.stringify(g),copy);
 assert.equal(r.revision,g.revision);assert.ok(actions(g).some(a=>a.id===r.actionId));
 assert.ok(r.stats.nodes>0);assert.equal(r.stats.selective,true);assert.ok(r.stats.elapsedMs>=0);
 assert.ok(r.candidates.length);assert.ok(r.candidates[0].reasons.length);assert.ok(r.candidates[0].line.length);
});
for(const name of ['mat-ivoire','derniere-sortie'])test(`analysis takes the real immediate win: ${name}`,()=>{
 assert.equal(typeof E.analyze,'function');const g=exerciseState(name);const r=E.analyze(g,{timeMs:500,maxNodes:3000});
 assert.equal(play(g,r.actionId).winner,g.turn);assert.equal(r.candidates[0].immediateWin,true);
});
test('analysis never invents moves for unrolled or terminal positions',()=>{
 assert.equal(typeof E.analyze,'function');assert.equal(E.analyze(createGame()).actionId,null);
 const g=exerciseState('derniere-sortie');const a=actions(g).find(a=>a.to==='off');const end=play(g,a.id);
 assert.equal(E.analyze(end).actionId,null);
});
test('analysis budget returns an actual legal fallback rather than a fabricated finished search',()=>{
 assert.equal(typeof E.analyze,'function');const g=ready(),r=E.analyze(g,{timeMs:0,maxNodes:1});
 assert.ok(actions(g).some(a=>a.id===r.actionId));assert.equal(r.stats.complete,false);
 assert.ok(r.stats.rollsEvaluated===0);
});
test('fixed node budget is deterministic and cached paths contain only legal actions',()=>{
 assert.equal(typeof E.analyze,'function');const g=ready();const opts={timeMs:10000,maxNodes:900,turnWidth:3,replyWidth:2};
 const a=E.analyze(g,opts),b=E.analyze(g,opts);assert.equal(a.actionId,b.actionId);
 for(const c of a.candidates){let p=g;for(const step of c.line){assert.ok(actions(p).some(x=>x.id===step.id));p=play(p,step.id);}}
});
test('search explanations identify actual capture and exact payment, no victory probability',()=>{
 assert.equal(typeof E.explainAction,'function');const g=exerciseState('tour-capture'),a=actions(g).find(a=>a.capture);
 const r=E.explainAction(g,a);assert.match(r.reasons.join(' '),/cavalier/i);assert.match(r.payment,/3/);
 assert.doesNotMatch(r.reasons.join(' '),/victoire.*%|Elo/i);
});
test('a double three is planned as four knight moves that capture the queen, not four unrelated steps',()=>{
 const g=roll({...createGame(),phase:'roll'},[3,3]);const r=E.analyze(g,{timeMs:6000,maxNodes:10000});
 let n=g;assert.equal(r.candidates[0].line.length,4);
 for(const a of r.candidates[0].line)n=play(n,a.id);
 assert.equal(n.chess.board.filter(p=>p==='bQ').length,0);assert.equal(n.chess.board.filter(p=>p==='bP').length,7);
 assert.match(r.candidates[0].reasons.join(' '),/suite.*dame.*pion/i);
 assert.equal(n.turn,'b');assert.equal(r.stats.turns,2);assert.ok(r.candidates[0].chanceComplete);
});
test('a useful race move is played BEFORE giving check and losing the remaining die',()=>{
 const g=exerciseState('fourchette'),r=E.analyze(g,{timeMs:4000,maxNodes:7000});
 const line=r.candidates[0].line;assert.equal(line.length,2);assert.equal(line[0].type,'race');assert.equal(line[1].type,'chess');
 let n=play(g,line[0].id);assert.equal(n.turn,'w');n=play(n,line[1].id);assert.equal(n.turn,'b');
 assert.match(r.candidates[0].reasons.join(' '),/avant.*échec/i);
});
test('checked king with unpayable geometry uses the real rescue actions',()=>{
 const g=createGame();g.phase='play';g.dice=[5,6];g.used=[false,false];g.chess.board.fill(null);
 g.chess.rights={wK:false,wQ:false,bK:false,bQ:false};g.chess.board[4]='wK';g.chess.board[63]='bK';g.chess.board[60]='bR';
 const r=E.analyze(g,{timeMs:200,maxNodes:250});assert.ok(actions(g).find(a=>a.id===r.actionId)?.rescue);assert.doesNotThrow(()=>play(g,r.actionId));
});
test('race exposure respects the priority of the enemy bar over board checkers',()=>{
 const r={points:Array(24).fill(0),bar:{w:0,b:1},off:{w:0,b:0}};r.points[4]=1;r.points[3]=-1;
 const f=E.raceFeatures(r,'w');assert.ok(Math.abs(f.exposure-(11/36)*20)<1e-8);
});
