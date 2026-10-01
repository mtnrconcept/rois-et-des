import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {squarePosition,pointPosition,captureEffect} from '../echgammon/royal-fleet.mjs';

const root=new URL('../assets/fleet/',import.meta.url);
async function glb(path) {
  const bytes=await readFile(new URL(path,root));
  assert.equal(bytes.readUInt32LE(0),0x46546c67,`${path}: real glTF binary`);
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  if(path==='board.glb')assert.ok(bytes.length<5*1024*1024,'compressed board stays below 5 MiB');
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(json.asset.version,'2.0');
  for(const item of [...(json.buffers||[]),...(json.images||[])])assert.ok(!item.uri||item.uri.startsWith('data:'),`${path}: self-contained`);
  return json;
}

test('Blender coordinates preserve chess orientation and the 24 distinct race points',()=>{
  assert.deepEqual(squarePosition(0),[-3.8500000000000005,1.56,3.8500000000000005]);
  assert.ok(squarePosition(63)[0]>0&&squarePosition(63)[2]<0);
  const unique=new Set(Array.from({length:24},(_,n)=>JSON.stringify(pointPosition(n))));
  assert.equal(unique.size,24);
  for(const n of [12,17,18,23])assert.ok(pointPosition(n)[2]<0,'upper row');
  for(const n of [0,5,6,11])assert.ok(pointPosition(n)[2]>0,'lower row');
  assert.ok(pointPosition(12)[0]<pointPosition(17)[0]);
  assert.ok(pointPosition(11)[0]<pointPosition(6)[0]);
  assert.ok(pointPosition(5)[0]<pointPosition(0)[0]);
});

test('requested captures have their own presentation effects',()=>{
  assert.equal(captureEffect('bR'),'cannon');
  assert.equal(captureEffect('wQ'),'royal-energy');
  assert.notEqual(captureEffect('wR'),captureEffect('bR'));
  assert.equal(new Set(['wK','wQ','wR','wB','wN','wP','bR','bQ'].map(captureEffect)).size,8);
});

test('board and race checker are self-contained Blender mesh assets',async()=>{
  for(const path of ['board.glb','checker.glb']){const asset=await glb(path);assert.ok(asset.meshes.length>0);assert.match(asset.asset.generator,/Blender/i);if(path==='board.glb')assert.ok(asset.meshes.length<=32,'static board batches avoid thousands of draw calls');}
});

for(const side of ['w','b'])for(const type of ['K','Q','R','B','N','P']) {
  const code=side+type;
  test(`${code} contains a rigid skin and six usable Blender animation clips`,async()=>{
    const asset=await glb(`pieces/${code}.glb`);
    assert.match(asset.asset.generator,/Blender/i);
    assert.ok(asset.skins?.length>0,'bone hierarchy exports with the model');
    assert.ok(asset.meshes.some(m=>m.primitives.some(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined)));
    assert.deepEqual(asset.animations.map(a=>a.name).sort(),['ATTACK','DEFEAT','HIT','IDLE','MOVE','VICTORY']);
    for(const clip of asset.animations){assert.ok(clip.channels.length>0);for(const sampler of clip.samplers){const input=asset.accessors[sampler.input];assert.ok(input.count>=2);assert.ok(input.max[0]>input.min[0],`${code}/${clip.name}: positive duration`);}}
  });
}
