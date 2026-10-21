import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, updateRatings, createSingleElimination, validateMoveEnvelope } from '../echgammon/competitive.mjs';
test('equal ratings have symmetric expectations and no draw change', () => {
  assert.equal(expectedScore(1200,1200), 0.5);
  assert.deepEqual(updateRatings(1200,1200,0.5), {a:1200,b:1200});
});
test('ratings change in opposite directions for decisive results', () => {
  assert.deepEqual(updateRatings(1200,1200,1),{a:1212,b:1188});
  assert.deepEqual(updateRatings(1200,1200,0),{a:1188,b:1212});
});
test('ratings reject tampered results and factors', () => {
  assert.throws(()=>updateRatings(1200,1200,2),RangeError);
  assert.throws(()=>updateRatings(1200,1200,1,0),RangeError);
  assert.throws(()=>expectedScore(NaN,1000),TypeError);
});
test('brackets do not duplicate players and handle non-power-of-two entries', () => {
  const b=createSingleElimination(['a','b','c','d','e'].map((id,i)=>({id,rating:1800-i*100})));
  assert.equal(b.rounds,3);
  assert.equal(b.matches.length,4);
  const ids=b.matches.flatMap(m=>[m.a,m.b]).filter(Boolean);
  assert.equal(new Set(ids).size,5);
  assert.equal(b.matches.filter(m=>m.bye).length,3);
});
test('duplicates and malformed identities rejected',()=>{
  assert.throws(()=>createSingleElimination([{id:'a'},{id:'a'}]),TypeError);
  assert.throws(()=>createSingleElimination([]),RangeError);
});
test('server envelope contract detects replayed turns and invalid nonces',()=>{
  const msg={gameId:'abc',turn:5,playerId:'alice',nonce:'abcdefghijklmnop'};
  assert.equal(validateMoveEnvelope(msg,'abc',5,'alice'),true);
  assert.equal(validateMoveEnvelope(msg,'abc',6,'alice'),false);
  assert.equal(validateMoveEnvelope({...msg,nonce:'x'},'abc',5,'alice'),false);
});
