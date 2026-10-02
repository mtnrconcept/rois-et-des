import {World, Body, Box, Plane, Cylinder, Vec3, Quaternion, Material, ContactMaterial} from '../assets/fleet/vendor/cannon-es.js';

export const DICE_SIZE=.58;
export const DICE_HALF=DICE_SIZE/2;
export const DICE_BOUNDS=4.25;
export const MAX_ROLL_SECONDS=12;
export const DICE_FACES=Object.freeze([
  {value:1,normal:Object.freeze([0,1,0])},
  {value:6,normal:Object.freeze([0,-1,0])},
  {value:3,normal:Object.freeze([1,0,0])},
  {value:4,normal:Object.freeze([-1,0,0])},
  {value:2,normal:Object.freeze([0,0,1])},
  {value:5,normal:Object.freeze([0,0,-1])}
].map(Object.freeze));
const STEP=1/120, RECORD_EVERY=2, REST_STEPS=72;

/** Read the highest world-space normal; alignment <= .98 means a cocked die. */
export function readUpperFace(quaternion){
  if(!Array.isArray(quaternion)||quaternion.length!==4||!quaternion.every(Number.isFinite))throw new TypeError('Invalid quaternion');
  const norm=Math.hypot(...quaternion);
  if(!Number.isFinite(norm)||norm<1e-12)throw new TypeError('Invalid quaternion');
  const [x,y,z,w]=quaternion.map(v=>v/norm);
  // The second row of the quaternion rotation matrix, dotted with each local normal.
  const row=[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)];
  let value=0,alignment=-Infinity;
  for(const face of DICE_FACES){
    const dot=face.normal.reduce((sum,v,i)=>sum+v*row[i],0);
    if(dot>alignment){value=face.value;alignment=dot;}
  }
  return {value,alignment:Math.min(1,alignment)};
}

function randomSource(seed){
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function randomOrientation(random){
  // Uniform sampling on SO(3), with no favored initial numbered face.
  const u=random(),v=2*Math.PI*random(),w=2*Math.PI*random();
  return new Quaternion(Math.sqrt(1-u)*Math.sin(v),Math.sqrt(1-u)*Math.cos(v),Math.sqrt(u)*Math.sin(w),Math.sqrt(u)*Math.cos(w));
}
function validateObstacles(obstacles){
  if(!Array.isArray(obstacles)||obstacles.length>64)throw new TypeError('Invalid obstacles');
  return obstacles.map(obstacle=>{
    if(!obstacle||!['x','z','radius','height'].every(key=>Number.isFinite(obstacle[key])))throw new TypeError('Invalid obstacle');
    const {x,z,radius,height}=obstacle;
    if(radius<=0||radius>1.5||height<=0||height>4||Math.abs(x)+radius>DICE_BOUNDS||Math.abs(z)+radius>DICE_BOUNDS)throw new RangeError('Obstacle outside the dice tray');
    return {x,z,radius,height};
  });
}

function releaseImpulse(body,pieces,random){
  // Look for nearby free floor rather than pushing a wedged die deeper into a
  // cluster. This only chooses the direction of a physical shake, never a face.
  let target=null,bestDistance=Infinity;
  const margin=DICE_HALF*Math.SQRT2+.08;
  for(let x=-3.6;x<=3.61;x+=.45)for(let z=-3.6;z<=3.61;z+=.45){
    if(pieces.some(piece=>Math.hypot(x-piece.x,z-piece.z)<piece.radius+margin))continue;
    const distance=Math.hypot(x-body.position.x,z-body.position.z);
    if(distance<bestDistance&&distance>.5){target={x,z};bestDistance=distance;}
  }
  const dx=(target?.x??0)-body.position.x,dz=(target?.z??0)-body.position.z,distance=Math.hypot(dx,dz)||1;
  const nearbyHeight=Math.max(0,...pieces.filter(piece=>Math.hypot(piece.x-body.position.x,piece.z-body.position.z)<2).map(piece=>piece.height));
  const lift=Math.min(4.8,Math.max(2.8,Math.sqrt(2*9.81*Math.max(.1,nearbyHeight-body.position.y+.5))));
  const flight=(lift+Math.sqrt(lift*lift+2*9.81*body.position.y))/9.81;
  const speed=Math.min(3,Math.max(.6,bestDistance/flight*1.1));
  return new Vec3(dx/distance*speed+(random()-.5)*.15,lift,dz/distance*speed+(random()-.5)*.15);
}

export class DiceSimulationError extends Error{
  constructor(result){
    super('Les dés ne sont pas stabilisés. Relancez le lancer.');
    this.name='DiceSimulationError';this.seed=result.seed;this.frames=result.frames;
    this.collisions=result.collisions;this.duration=result.duration;this.settled=false;
  }
}

/**
 * Compute a rigid-body throw at 120 Hz and record its trajectory at 60 Hz.
 * The returned values are read only after both bodies physically come to rest.
 * Positions are relative to a Y-up tray, its floor at zero and inner rims at ±4.25.
 * Obstacles are static vertical cylinders representing piece bases/silhouettes.
 * No final transform is snapped, no face value is requested, and no failed roll is
 * replaced with random numbers. A cocked, motionless die receives at most three
 * off-center shakes towards free floor (recorded in nudges). Their impulse is
 * bounded to 4.8 upward and 3.15 horizontally for a unit-mass die. The world then
 * continues integrating normally; unresolved rolls throw DiceSimulationError.
 */
export function simulateDice({seed,obstacles=[]}={}){
  if(seed===undefined){
    if(!globalThis.crypto?.getRandomValues)throw new Error('Secure random seed unavailable');
    seed=globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  if(!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new TypeError('seed must be an unsigned 32-bit integer');
  const pieces=validateObstacles(obstacles),random=randomSource(seed);
  const world=new World({gravity:new Vec3(0,-9.81,0),allowSleep:true});
  world.solver.iterations=20;world.solver.tolerance=1e-8;
  const ivory=new Material('dice'),felt=new Material('tray'),stone=new Material('pieces');
  const contactOptions={contactEquationStiffness:1e8,contactEquationRelaxation:3,frictionEquationStiffness:1e8};
  world.addContactMaterial(new ContactMaterial(ivory,felt,{...contactOptions,friction:.42,restitution:.34}));
  world.addContactMaterial(new ContactMaterial(ivory,ivory,{...contactOptions,friction:.35,restitution:.32}));
  world.addContactMaterial(new ContactMaterial(ivory,stone,{...contactOptions,friction:.12,restitution:.3}));
  const tags=new Map();
  function addStatic(shape,position,kind,rotation){
    const body=new Body({mass:0,shape,material:kind==='obstacle'?stone:felt,position});
    if(rotation)body.quaternion.setFromEuler(...rotation);
    world.addBody(body);tags.set(body,{kind});return body;
  }
  addStatic(new Plane(),new Vec3(0,0,0),'floor',[-Math.PI/2,0,0]);
  // Infinite inward planes contain even an airborne die, without thin-wall tunneling.
  addStatic(new Plane(),new Vec3(-DICE_BOUNDS,0,0),'wall',[0,Math.PI/2,0]);
  addStatic(new Plane(),new Vec3(DICE_BOUNDS,0,0),'wall',[0,-Math.PI/2,0]);
  addStatic(new Plane(),new Vec3(0,0,-DICE_BOUNDS),'wall');
  addStatic(new Plane(),new Vec3(0,0,DICE_BOUNDS),'wall',[0,Math.PI,0]);
  for(const {x,z,radius,height} of pieces)addStatic(new Cylinder(radius,radius,height,12),new Vec3(x,height/2,z),'obstacle');
  const releaseHeight=Math.max(0,...pieces.map(p=>p.height))+1.8;
  const dice=[0,1].map(index=>{
    const side=index===0?-1:1;
    const body=new Body({
      mass:1,shape:new Box(new Vec3(DICE_HALF,DICE_HALF,DICE_HALF)),material:ivory,
      position:new Vec3(side*(.85+random()*.3),releaseHeight+random()*.3,2.2+random()*.45),
      quaternion:randomOrientation(random),
      velocity:new Vec3(-side*(1.2+random()*1.8),1.8+random()*1.1,-2.2-random()*2.2),
      angularVelocity:new Vec3((random()-.5)*22,(random()-.5)*22,(random()-.5)*22),
      linearDamping:.12,angularDamping:.18,sleepSpeedLimit:.07,sleepTimeLimit:.45
    });
    world.addBody(body);tags.set(body,{kind:'dice',index});return body;
  });
  const frames=[],collisions=[],nudges=[];
  let step=0,quietSteps=0;
  for(let index=0;index<dice.length;index++)dice[index].addEventListener('collide',event=>{
    const other=tags.get(event.body);
    if(other.kind==='dice'&&index>other.index)return;
    const speed=Math.abs(event.contact.getImpactVelocityAlongNormal());
    if(speed>.08)collisions.push({t:step*STEP,dice:other.kind==='dice'?[index,other.index]:[index],other:other.kind,speed});
  });
  const q=body=>body.quaternion.toArray();
  const record=()=>frames.push({t:step*STEP,dice:dice.map(body=>({position:body.position.toArray(),quaternion:q(body)}))});
  const still=body=>body.velocity.lengthSquared()<.0036&&body.angularVelocity.lengthSquared()<.01;
  record();
  const stalled=[0,0],nudgeCount=[0,0],anchors=dice.map(body=>({position:body.position.clone(),quaternion:body.quaternion.clone()}));
  for(step=1;step<=MAX_ROLL_SECONDS/STEP;step++){
    world.step(STEP);
    for(let index=0;index<2;index++){
      const body=dice[index],face=readUpperFace(q(body));
      stalled[index]=still(body)&&face.alignment<=.98?stalled[index]+1:0;
      // A die wedged against a piece can jitter above the sleep-speed threshold.
      // Detect that by its displacement over a full second, not just velocity.
      let wedged=false;
      if(step%120===0){
        const anchor=anchors[index],dot=body.quaternion.toArray().reduce((sum,v,i)=>sum+v*anchor.quaternion.toArray()[i],0);
        wedged=face.alignment<=.98&&body.position.distanceTo(anchor.position)<.06&&Math.abs(dot)>.99;
        anchor.position.copy(body.position);anchor.quaternion.copy(body.quaternion);
      }
      if((stalled[index]>=120||wedged)&&nudgeCount[index]<3){
        // Real impulses add linear momentum and torque; every following transform
        // still comes from Cannon. Their direction depends on the seed, not a face.
        const impulse=releaseImpulse(body,pieces,random);
        const point=new Vec3((random()-.5)*.14,0,(random()-.5)*.14);
        body.applyImpulse(impulse,point);nudgeCount[index]++;stalled[index]=0;
        nudges.push({t:step*STEP,die:index,impulse:impulse.toArray(),point:point.toArray()});
      }
    }
    quietSteps=dice.every(body=>still(body)&&readUpperFace(q(body)).alignment>.98)?quietSteps+1:0;
    if(step%RECORD_EVERY===0){
      record();
      if(quietSteps>=REST_STEPS){
        const values=dice.map(body=>readUpperFace(q(body)).value);
        return {seed,values,frames,duration:step*STEP,collisions,nudges,settled:true};
      }
    }
  }
  const failure=new DiceSimulationError({seed,frames,duration:MAX_ROLL_SECONDS,collisions});
  failure.nudges=nudges;throw failure;
}
