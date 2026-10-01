import test from 'node:test'; import assert from 'node:assert/strict';
import { createGame } from '../src/engine.js'; import { chooseMove } from '../src/ai.js';
test('easy AI returns a legal-looking action',()=>{const g=createGame();g.turn='black';const m=chooseMove(g,3,'easy');assert.ok(m===null||('pieceId'in m&&'to'in m));});
test('medium AI prefers an available capture',()=>{const g=createGame();g.turn='black';g.pieces=[{id:'bR',color:'black',type:'rook',x:0,y:3},{id:'wF',color:'white',type:'bishop',x:0,y:1}];const m=chooseMove(g,3,'medium');assert.deepEqual(m?.to,{x:0,y:1});});
