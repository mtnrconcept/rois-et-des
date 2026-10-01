import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rollActions, legalMoves, applyMove, canBearOff } from '../src/engine.js';

test('initial game has six pieces per side', () => {
  const g=createGame();
  assert.equal(g.pieces.filter(p=>p.color==='white').length,6);
  assert.equal(g.pieces.filter(p=>p.color==='black').length,6);
});
test('double produces four actions',()=>assert.deepEqual(rollActions([4,4]),[4,4,4,4]));
test('a rook range is capped by die value',()=>{
  const g=createGame();
  const rook=g.pieces.find(p=>p.color==='white'&&p.type==='rook');
  assert.ok(legalMoves(g,rook.id,2).every(m=>Math.abs(m.x-rook.x)+Math.abs(m.y-rook.y)<=2));
});
test('capture sends isolated enemy to prison',()=>{
  const g=createGame();
  g.pieces=[{id:'wR',color:'white',type:'rook',x:0,y:0},{id:'bF',color:'black',type:'bishop',x:0,y:2}];
  const n=applyMove(g,'wR',{x:0,y:2},3);
  assert.equal(n.pieces.find(p=>p.id==='bF').prison,true);
});
test('two allied pieces form an uncapturable bastion',()=>{
  const g=createGame();
  g.pieces=[{id:'wR',color:'white',type:'rook',x:0,y:0},{id:'b1',color:'black',type:'bishop',x:0,y:2},{id:'b2',color:'black',type:'knight',x:0,y:2}];
  assert.equal(legalMoves(g,'wR',4).some(m=>m.x===0&&m.y===2),false);
});
test('bearing off requires all active pieces in home zone',()=>{
  const g=createGame();
  assert.equal(canBearOff(g,'white'),false);
  g.pieces.filter(p=>p.color==='white').forEach(p=>{p.y=6});
  assert.equal(canBearOff(g,'white'),true);
});
