import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateDice, readUpperFace, DiceSimulationError, DICE_FACES, DICE_HALF, DICE_BOUNDS, MAX_ROLL_SECONDS} from '../echgammon/dice-physics.mjs';

function rotate([x,y,z,w],[vx,vy,vz]) {
  const tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);
  return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];
}
function corners(die) {
  const result=[];
  for(const x of [-DICE_HALF,DICE_HALF])for(const y of [-DICE_HALF,DICE_HALF])for(const z of [-DICE_HALF,DICE_HALF]){
    const r=rotate(die.quaternion,[x,y,z]);result.push(r.map((v,i)=>v+die.position[i]));
  }
  return result;
}

test('dice numbering has opposite faces summing to seven and is read from orientation',()=>{
  assert.equal(DICE_FACES.length,6);
  for(const face of DICE_FACES){
    const opposite=DICE_FACES.find(f=>f.normal.every((n,i)=>n===-face.normal[i]));
    assert.equal(face.value+opposite.value,7);
  }
  assert.deepEqual(readUpperFace([0,0,0,1]),{value:1,alignment:1});
  assert.deepEqual(readUpperFace([1,0,0,0]),{value:6,alignment:1});
  assert.equal(readUpperFace([0,0,Math.SQRT1_2,Math.SQRT1_2]).value,3);
  assert.equal(readUpperFace([0,0,-Math.SQRT1_2,Math.SQRT1_2]).value,4);
  assert.equal(readUpperFace([-Math.SQRT1_2,0,0,Math.SQRT1_2]).value,2);
  assert.equal(readUpperFace([Math.SQRT1_2,0,0,Math.SQRT1_2]).value,5);
  assert.ok(readUpperFace([Math.sin(Math.PI/8),0,0,Math.cos(Math.PI/8)]).alignment<.98);
});

test('a seeded physics roll is deterministic including impacts and 60 Hz replay',()=>{
  const first=simulateDice({seed:42}),second=simulateDice({seed:42});
  assert.deepEqual(first,second);
  assert.equal(first.settled,true);assert.equal(first.frames[0].t,0);
  assert.equal(first.duration,first.frames.at(-1).t);
  for(let i=1;i<first.frames.length;i++)assert.ok(Math.abs(first.frames[i].t-first.frames[i-1].t-1/60)<1e-9);
  assert.ok(first.collisions.length>0);
  assert.ok(first.collisions.every(c=>c.speed>=0&&c.t<=first.duration));
});

test('recorded motion includes gravity, rotation, ground impact and a physical rebound',()=>{
  const roll=simulateDice({seed:7}),frames=roll.frames;
  const h=1/60;
  for(let die=0;die<2;die++){
    const y0=frames[0].dice[die].position[1],y1=frames[1].dice[die].position[1],y2=frames[2].dice[die].position[1];
    assert.ok((y2-2*y1+y0)/(h*h)<-9,'initial free flight accelerates downwards');
    assert.notDeepEqual(frames[0].dice[die].quaternion,frames[20].dice[die].quaternion);
    assert.ok(frames.some((frame,i)=>i>30&&frame.dice[die].position[1]>frames[i-1].dice[die].position[1]+.001),'at least one bounce after release');
  }
  assert.ok(roll.collisions.some(c=>c.other==='floor'&&c.speed>1));
});

test('100 seeded throws settle within the bound without choosing or snapping a final face',()=>{
  const values=new Set(),pairs=new Set();let diceImpacts=0,wallImpacts=0;
  for(let seed=0;seed<100;seed++){
    const roll=simulateDice({seed});
    assert.equal(roll.settled,true);assert.ok(roll.duration<=MAX_ROLL_SECONDS);
    assert.equal(roll.values.length,2);pairs.add(roll.values.join(','));
    for(let i=0;i<2;i++){
      const die=roll.frames.at(-1).dice[i],face=readUpperFace(die.quaternion);
      assert.equal(roll.values[i],face.value);assert.ok(face.alignment>.98);values.add(face.value);
      assert.ok(Math.abs(Math.hypot(...die.quaternion)-1)<1e-8);
      for(const [x,y,z] of corners(die)){
        assert.ok(y>=-.006,`seed ${seed}: resting die does not pass through floor (${y})`);
        assert.ok(Math.abs(x)<=DICE_BOUNDS+.006&&Math.abs(z)<=DICE_BOUNDS+.006);
      }
      const earlier=roll.frames.at(-12).dice[i];
      assert.ok(Math.hypot(...die.position.map((v,k)=>v-earlier.position[k]))<.006);
    }
    const [a,b]=roll.frames.at(-1).dice;
    assert.ok(Math.hypot(...a.position.map((v,k)=>v-b.position[k]))>=2*DICE_HALF-.006);
    diceImpacts+=roll.collisions.filter(c=>c.other==='dice').length;
    wallImpacts+=roll.collisions.filter(c=>c.other==='wall').length;
  }
  assert.deepEqual([...values].sort(),[1,2,3,4,5,6]);
  assert.ok(pairs.size>=24,'different throws produce a broad set of actual outcomes');
  assert.ok(diceImpacts>0,'dice collide with one another');
  assert.ok(wallImpacts>0,'the containing walls receive physical impacts');
});

test('static piece obstacles alter physical trajectories and produce impacts',()=>{
  const obstacles=[{x:0,z:0,radius:.55,height:1.2},{x:-1,z:1,radius:.35,height:.8},{x:1,z:1,radius:.35,height:.8}];
  const original=JSON.stringify(obstacles),without=simulateDice({seed:0}),withPieces=simulateDice({seed:0,obstacles});
  assert.notDeepEqual(withPieces.frames,without.frames);
  assert.ok(withPieces.collisions.some(c=>c.other==='obstacle'));
  assert.equal(JSON.stringify(obstacles),original);
  assert.ok(withPieces.values.every(v=>Number.isInteger(v)&&v>=1&&v<=6));
});

function openingObstacles(){
  const heights={P:.99,N:1.29,B:1.40,R:1.44,Q:1.59,K:1.65},roles='RNBQKBNR',obstacles=[];
  for(const rank of [0,1,6,7])for(let file=0;file<8;file++)obstacles.push({
    x:(file-3.5)*1.1,z:(3.5-rank)*1.1,radius:.37,height:heights[rank===1||rank===6?'P':roles[file]]
  });
  return obstacles;
}
function denseObstacles(){
  const obstacles=[];
  for(let rank=2;rank<6;rank++)for(let file=2;file<6;file++)obstacles.push({
    x:(file-3.5)*1.1,z:(3.5-rank)*1.1,radius:.37,height:rank===3?1.59:.99
  });
  return obstacles;
}

test('100 throws among the actual 32 opening piece colliders reach an upright physical result',()=>{
  const obstacles=openingObstacles();let obstacleImpacts=0;
  for(let seed=0;seed<100;seed++){
    const roll=simulateDice({seed,obstacles});
    assert.ok(roll.duration<=MAX_ROLL_SECONDS);assert.equal(roll.settled,true);
    obstacleImpacts+=roll.collisions.filter(c=>c.other==='obstacle').length;
    for(let index=0;index<2;index++){
      const die=roll.frames.at(-1).dice[index],face=readUpperFace(die.quaternion);
      assert.equal(roll.values[index],face.value);assert.ok(face.alignment>.98);
      assert.ok(roll.nudges.filter(n=>n.die===index).length<=3);
      assert.ok(corners(die).every(([,y])=>y>=-.006));
    }
  }
  assert.ok(obstacleImpacts>100);
});

test('dense central pieces either yield a true settled result or an explicit bounded refusal',()=>{
  const obstacles=denseObstacles();let settled=0,refused=0;
  for(let seed=0;seed<30;seed++){
    try{
      const roll=simulateDice({seed,obstacles});settled++;
      assert.equal(roll.settled,true);assert.ok(roll.duration<=MAX_ROLL_SECONDS);
      roll.frames.at(-1).dice.forEach((die,index)=>{
        const face=readUpperFace(die.quaternion);assert.ok(face.alignment>.98);assert.equal(roll.values[index],face.value);
      });
    }catch(error){
      assert.ok(error instanceof DiceSimulationError);refused++;
      assert.equal(error.settled,false);assert.equal(error.values,undefined);
      assert.equal(error.seed,seed);assert.equal(error.duration,MAX_ROLL_SECONDS);
      assert.equal(error.frames.at(-1).t,MAX_ROLL_SECONDS);
      assert.ok(error.nudges.length>0,'attempts to release a cocked die are physical and recorded');
      for(let die=0;die<2;die++)assert.ok(error.nudges.filter(n=>n.die===die).length<=3);
    }
  }
  assert.ok(settled>=20);assert.ok(refused>0,'the unresolved path must be exercised');
});

test('a physical shake is recorded and does not replace the orientation with a chosen face',()=>{
  const roll=simulateDice({seed:30});
  assert.ok(roll.nudges.length>0);
  for(const nudge of roll.nudges){
    assert.ok(nudge.impulse[1]>0);assert.ok(nudge.t<roll.duration);
    const before=roll.frames.findLast(frame=>frame.t<=nudge.t),after=roll.frames.find(frame=>frame.t>=nudge.t+.05);
    assert.notDeepEqual(before.dice[nudge.die].position,after.dice[nudge.die].position);
    assert.notDeepEqual(before.dice[nudge.die].quaternion,after.dice[nudge.die].quaternion);
  }
  assert.deepEqual(roll.values,roll.frames.at(-1).dice.map(die=>readUpperFace(die.quaternion).value));
});

test('invalid configuration fails explicitly rather than manufacturing a roll',()=>{
  for(const seed of [-1,1.5,NaN,Infinity,2**32,'42'])assert.throws(()=>simulateDice({seed}),/seed/i);
  for(const obstacles of [null,{},[{x:NaN,z:0,radius:1,height:1}],[{x:0,z:0,radius:-1,height:1}],[{x:10,z:0,radius:1,height:1}]]){
    assert.throws(()=>simulateDice({seed:1,obstacles}),/obstacle/i);
  }
  assert.throws(()=>readUpperFace([0,0,0,0]),/quaternion/i);
});
