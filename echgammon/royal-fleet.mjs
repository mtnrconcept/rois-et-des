import * as THREE from '../assets/fleet/vendor/three.module.js';
import {GLTFLoader} from '../assets/fleet/vendor/GLTFLoader.js';
import {DRACOLoader} from '../assets/fleet/vendor/DRACOLoader.js';
import {OrbitControls} from '../assets/fleet/vendor/OrbitControls.js';
import {clone as cloneSkeleton} from '../assets/fleet/vendor/SkeletonUtils.js';
import {RoomEnvironment} from '../assets/fleet/vendor/RoomEnvironment.js';
import {createDiceVisuals,playDiceFrames} from './dice-visuals.mjs';

// Presentation only: coordinates and animation never decide whether a move is legal.
const ASSETS=new URL('../assets/fleet/',import.meta.url);
const COLORS={w:0xb51f38,b:0x166bab,gold:0xf6c875,legal:0x63eadb};
const PIECES=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'];
const TYPES={K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn'};
const smooth=t=>t*t*(3-2*t),clamp=t=>Math.max(0,Math.min(1,t));
export const squarePosition=n=>[(n%8-3.5)*1.1,1.56,(3.5-Math.floor(n/8))*1.1];
export function pointPosition(n,index=0) {
  const left=n>=6&&n<18,top=n>=12;
  const column=top?n-(left?12:18):(left?11:5)-n;
  return [(left?-10.4:10.4)+(column-2.5)*1.035,1.46+Math.floor(index/5)*.14,(top?-1:1)*(5.12-(index%5)*.72)];
}
export function reservePosition(kind,side,index=0) {
  const sign=side==='w'?-1:1;
  return [sign*14.55,1.40+Math.floor(index/5)*.14,(kind==='bar'?-2.3:2.0)+(index%5)*.68];
}
export function captureEffect(code) {
  if(code==='bR')return 'cannon';
  if(code==='wQ')return 'royal-energy';
  if(code[1]==='Q')return 'tide-energy';
  if(code[1]==='R')return 'siege-fire';
  return {K:'sword-arc',B:'astral-ward',N:'cavalry-charge',P:'blade-sparks'}[code[1]];
}
const vector=a=>new THREE.Vector3(...a);

/** Load the actual Blender exports; callers keep the accessible 2D controls. */
export async function createFleetView({container,onSquare,onPoint,onBar,onOff,onBusy=()=>{}}) {
  let disposed=false,enabled=true,intersecting=true,busy=false,frame=0,lastTime=0,current=null,pending=null,animation=null;
  let diceVisuals=null,diceAbort=null,diceCamera=null;
  let cameraMode=container.clientWidth<680?'chess':'overview';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x081b25);
  const camera=new THREE.OrthographicCamera(-20,20,12,-12,.1,180);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,container.clientWidth<680?1.25:1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.90;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const canvas=renderer.domElement;canvas.dataset.fleetCanvas='';canvas.setAttribute('aria-label','Citadelle 3D interactive. Utilisez aussi les commandes du plateau accessible.');canvas.setAttribute('role','img');
  canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none;';container.append(canvas);
  container.dataset.fleetState='loading';
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.minPolarAngle=.15;controls.maxPolarAngle=1.30;controls.minZoom=.65;controls.maxZoom=3.3;controls.rotateSpeed=.55;controls.screenSpacePanning=true;
  const ambient=new THREE.HemisphereLight(0xd9efff,0x694a2b,1.2);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xffe4bb,2.5);key.position.set(-8,22,15);scene.add(key);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:.5,far:70});key.shadow.bias=-.0005;key.shadow.normalBias=.025;
  const rim=new THREE.DirectionalLight(0x8ecfff,1.2);rim.position.set(14,10,-12);scene.add(rim);
  const environment=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(environment,.06);scene.environment=env.texture;scene.environmentIntensity=.48;environment.dispose();pmrem.dispose();
  const boardGroup=new THREE.Group(),armyGroup=new THREE.Group(),checkerGroup=new THREE.Group(),overlayGroup=new THREE.Group(),effects=new THREE.Group();
  scene.add(boardGroup,armyGroup,checkerGroup,overlayGroup,effects);
  const draco=new DRACOLoader().setDecoderPath(new URL('vendor/draco/',ASSETS).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
  const loader=new GLTFLoader().setDRACOLoader(draco),templates=new Map(),pool=[],checkers=[],squareRecords=new Map();
  const generatedGeometry=new Set(),generatedMaterial=new Set(),hitTargets=[];
  const geometry=g=>(generatedGeometry.add(g),g),material=m=>(generatedMaterial.add(m),m);
  const invisible=material(new THREE.MeshBasicMaterial({visible:false}));
  const disc=geometry(new THREE.RingGeometry(.30,.44,32)),dot=geometry(new THREE.CircleGeometry(.115,20));
  const legalMat=material(new THREE.MeshBasicMaterial({color:COLORS.legal,transparent:true,opacity:.88,depthWrite:false}));
  const selectedMat=material(new THREE.MeshBasicMaterial({color:COLORS.gold,transparent:true,opacity:.95,depthWrite:false}));
  const lastMat=material(new THREE.MeshBasicMaterial({color:0xedd09b,transparent:true,opacity:.26,depthWrite:false}));
  const contactMat=material(new THREE.MeshBasicMaterial({color:0x111b23,transparent:true,opacity:.24,depthWrite:false}));
  const contactGeo=geometry(new THREE.CircleGeometry(.36,24));
  const squarePlane=geometry(new THREE.PlaneGeometry(1.09,1.09)),pointPlane=geometry(new THREE.PlaneGeometry(1.025,4.75)),reservePlane=geometry(new THREE.PlaneGeometry(.92,3.25));
  function hitPlane(g,pos,data) {const mesh=new THREE.Mesh(g,invisible);mesh.rotation.x=-Math.PI/2;mesh.position.copy(vector(pos));mesh.userData.fleetHit=data;overlayGroup.add(mesh);hitTargets.push(mesh);}
  for(let n=0;n<64;n++)hitPlane(squarePlane,squarePosition(n),{kind:'square',n});
  for(let n=0;n<24;n++){const pos=pointPosition(n);pos[2]=n>=12?-3.27:3.27;hitPlane(pointPlane,pos,{kind:'point',n});}
  for(const side of ['w','b'])for(const kind of ['bar','off']){const pos=reservePosition(kind,side,2);hitPlane(reservePlane,pos,{kind,side});}
  const markers=[];
  function marker(pos,mat,shape=disc,scale=1) {const mesh=new THREE.Mesh(shape,mat);mesh.rotation.x=-Math.PI/2;mesh.position.copy(vector(pos));mesh.position.y+=.035;mesh.scale.setScalar(scale);overlayGroup.add(mesh);markers.push(mesh);}
  function clearMarkers(){for(const m of markers)overlayGroup.remove(m);markers.length=0;}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  function pointerDown(e){down={x:e.clientX,y:e.clientY,id:e.pointerId};}
  function pointerUp(e){
    if(!down||down.id!==e.pointerId||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){down=null;return;}down=null;
    if(disposed||!enabled||busy||current?.canInteract===false)return;
    const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const children=[...pool.filter(p=>p.root.visible).map(p=>p.root),...checkers.filter(p=>p.visible),...hitTargets];
    for(const hit of raycaster.intersectObjects(children,true)) {
      let obj=hit.object;while(obj&&!obj.userData.fleetHit)obj=obj.parent;
      const h=obj?.userData.fleetHit;if(!h)continue;
      if(h.kind==='square')onSquare?.(h.n);else if(h.kind==='point')onPoint?.(h.n);else if(h.kind==='bar')onBar?.(h.side);else onOff?.(h.side);break;
    }
  }
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',()=>{down=null;});
  function setBusy(value){busy=value;container.dataset.fleetBusy=String(value);onBusy(value);}
  function playClip(record,name,duration=null) {
    if(!record)return;
    const clip=record.clips.find(c=>c.name===name||c.name.endsWith('_'+name));
    if(!clip)return;
    record.mixer.stopAllAction();const action=record.mixer.clipAction(clip);action.reset();
    action.setLoop(name==='IDLE'?THREE.LoopRepeat:THREE.LoopOnce,name==='IDLE'?Infinity:1);action.clampWhenFinished=name!=='IDLE';
    if(duration)action.setDuration(duration);action.play();record.clip=name;
  }
  function piece(code) {
    const template=templates.get(code),model=cloneSkeleton(template.scene),root=new THREE.Group();root.add(model);armyGroup.add(root);
    model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
    const contact=new THREE.Mesh(contactGeo,contactMat);contact.rotation.x=-Math.PI/2;contact.position.y=.012;root.add(contact);
    let emitter=null;model.traverse(o=>{if(o.name.includes('Emitter'))emitter=o;});
    const record={root,model,code,emitter,clips:template.animations,mixer:new THREE.AnimationMixer(model),clip:null};pool.push(record);playClip(record,'IDLE');return record;
  }
  function makeChecker(side) {
    const root=cloneSkeleton(templates.get('checker').scene);root.userData.side=side;
    root.traverse(o=>{if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];o.material=mats.map(m=>{const copy=material(m.clone());if(!/gold|or|brass/i.test(m.name))copy.color.set(COLORS[side]);return copy;});if(o.material.length===1)o.material=o.material[0];}});
    checkerGroup.add(root);checkers.push(root);return root;
  }
  function syncNow(state) {
    current=state;const {game,selected,available=[]}=state;
    const previous=new Map(squareRecords);squareRecords.clear();for(const p of pool)p.root.visible=false;
    const used=new Set();
    for(let n=0;n<64;n++) {
      const code=game.chess.board[n];if(!code)continue;
      let p=previous.get(n);if(!p||p.code!==code||used.has(p))p=pool.find(p=>p.code===code&&!used.has(p))||piece(code);
      used.add(p);squareRecords.set(n,p);p.root.visible=true;p.root.position.copy(vector(squarePosition(n)));p.root.scale.setScalar(1);p.root.rotation.set(0,code[0]==='w'?Math.PI:0,0);p.root.userData.fleetHit={kind:'square',n};
      const pose=game.winner===code[0]?'VICTORY':'IDLE';if(p.clip!==pose)playClip(p,pose);
    }
    let wi=0,bi=15;for(const c of checkers)c.visible=false;
    function put(side,pos,hit){const c=checkers[side==='w'?wi++:bi++];if(!c)return;c.visible=true;c.position.copy(vector(pos));c.rotation.set(0,0,0);c.scale.setScalar(1);c.userData.fleetHit=hit;}
    game.race.points.forEach((count,n)=>{for(let i=0;i<Math.abs(count);i++)put(count>0?'w':'b',pointPosition(n,i),{kind:'point',n});});
    for(const side of ['w','b'])for(const kind of ['bar','off'])for(let i=0;i<game.race[kind][side];i++)put(side,reservePosition(kind,side,i),{kind,side});
    clearMarkers();
    if(game.last?.type==='chess')for(const n of [game.last.from,game.last.to])marker(squarePosition(n),lastMat,dot,2.9);
    if(selected) {
      const side=game.turn,pos=selected.type==='chess'?squarePosition(selected.from):selected.from==='bar'?reservePosition('bar',side,2):pointPosition(selected.from,Math.min(4,Math.abs(game.race.points[selected.from])-1));marker(pos,selectedMat);
      const seen=new Set();for(const a of available)if(a.type===selected.type&&a.from===selected.from&&!seen.has(a.to)){seen.add(a.to);marker(a.type==='chess'?squarePosition(a.to):a.to==='off'?reservePosition('off',side,2):pointPosition(a.to,Math.min(4,Math.abs(game.race.points[a.to]))),legalMat,a.capture||a.hit?disc:dot);}
    }
    container.dataset.fleetRevision=String(game.revision);container.dataset.fleetPieces=String(squareRecords.size);container.dataset.fleetCheckers=String(checkers.filter(c=>c.visible).length);
    if(reduced.matches)for(const p of pool)p.mixer.setTime(0);
    draw();wake();
  }
  function sync(state){if(disposed)return;if(busy){pending=state;return;}syncNow(state);}
  function draw(){if(!disposed&&enabled&&intersecting&&!document.hidden)renderer.render(scene,camera);}
  function cameraSettings(mode) {
    const x=mode==='left'?-10.4:mode==='right'?10.4:0;
    const horizontal=mode==='overview'?37.5:mode==='chess'?13.3:9.4;
    const vertical=mode==='overview'?22:mode==='chess'?12.2:13.8;
    const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight||520),aspect=width/height;
    const half=Math.max(vertical,horizontal/aspect)/2;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
    return {x};
  }
  function setCamera(mode='overview') {
    if(!['overview','chess','left','right'].includes(mode))return;cameraMode=mode;const {x}=cameraSettings(mode);camera.zoom=1;
    camera.position.set(x,mode==='overview'?30:34,mode==='overview'?27:10);controls.target.set(x,1.1,mode==='overview'?-.8:0);camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.update();container.dataset.fleetCamera=mode;draw();
  }
  function resize(){if(disposed)return;renderer.setSize(Math.max(1,container.clientWidth),Math.max(1,container.clientHeight||520),false);cameraSettings(cameraMode);draw();}
  function canRun(){return !disposed&&enabled&&intersecting&&!document.hidden;}
  function wake(){if(!frame&&canRun()){lastTime=performance.now();frame=requestAnimationFrame(tick);}}
  function tick(now){
    frame=0;if(!canRun())return;
    if(now-lastTime<30){frame=requestAnimationFrame(tick);return;}
    const dt=Math.min(.06,(now-lastTime)/1000);lastTime=now;
    if(animation)animation.update(now);
    if(!reduced.matches||busy)for(const p of pool)if(p.root.visible)p.mixer.update(dt);
    draw();if(!frame&&(animation||!reduced.matches))frame=requestAnimationFrame(tick);
  }
  function visibility(){if(!canRun()){cancelAnimationFrame(frame);frame=0;if(animation)animation.finish();}else wake();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
  const intersectionObserver=new IntersectionObserver(entries=>{intersecting=entries[0].isIntersecting;visibility();});intersectionObserver.observe(container);
  document.addEventListener('visibilitychange',visibility);controls.addEventListener('change',draw);
  function setEnabled(value){enabled=Boolean(value);controls.enabled=enabled;visibility();if(enabled){resize();draw();}}
  function clearDice(){
    diceAbort?.abort();diceAbort=null;diceVisuals?.dispose();diceVisuals=null;
    if(diceCamera&&!disposed)setCamera(diceCamera);diceCamera=null;
  }
  async function animateDice({result,signal,onCollision}){
    clearDice();diceCamera=cameraMode;setCamera('chess');setBusy(true);controls.enabled=false;
    const controller=new AbortController();diceAbort=controller;
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    diceVisuals=createDiceVisuals();diceVisuals.group.position.y=1.56;scene.add(diceVisuals.group);
    container.dataset.diceValues=result.values.join(',');container.dataset.dicePhysics='cannon-es';
    try{return await playDiceFrames({result,visuals:diceVisuals,draw:()=>{renderer.shadowMap.needsUpdate=true;draw();},signal:controller.signal,reducedMotion:reduced.matches,onCollision});}
    finally{signal?.removeEventListener('abort',abort);if(!disposed){controls.enabled=enabled;setBusy(false);}}
  }
  function clearEffects(){while(effects.children.length){const child=effects.children[0];effects.remove(child);child.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}}
  function createAttackFx(code,start,end) {
    const kind=captureEffect(code),color=code==='wQ'?0xff4d7d:code[0]==='w'?0xffbd57:0x6bddff;
    const fx=new THREE.Group();effects.add(fx);const glow=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false});
    const projectile=new THREE.Mesh(new THREE.IcosahedronGeometry(kind==='cannon'?.12:.18,1),kind==='cannon'?new THREE.MeshStandardMaterial({color:0x172027,metalness:.8,roughness:.3}):glow);fx.add(projectile);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.38,.025,6,48),glow.clone());ring.rotation.x=Math.PI/2;fx.add(ring);
    const particles=[];for(let i=0;i<20;i++){const p=new THREE.Mesh(new THREE.IcosahedronGeometry(kind==='cannon'?.10:.035,0),new THREE.MeshBasicMaterial({color:kind==='cannon'?0x9aabac:color,transparent:true,opacity:.7,depthWrite:false}));p.userData.angle=i*2.39996;particles.push(p);fx.add(p);}
    const ranged=['cannon','royal-energy','tide-energy','siege-fire','astral-ward'].includes(kind);
    container.dataset.fleetEffect=kind;
    return t=>{
      const flight=clamp((t-.15)/.36),impact=clamp((t-.48)/.4);
      projectile.visible=ranged&&t>.14&&t<.53;projectile.position.copy(start).lerp(end,flight);projectile.position.y+=Math.sin(flight*Math.PI)*(kind==='cannon'?.36:.6);projectile.rotation.set(t*13,t*9,0);
      ring.visible=t>.44;ring.position.copy(end);ring.position.y=.08+1.56;ring.scale.setScalar(.1+impact*2.1);ring.material.opacity=.95*(1-impact);
      for(let i=0;i<particles.length;i++){const p=particles[i],a=p.userData.angle;p.visible=t>.47;p.position.copy(end);p.position.x+=Math.cos(a)*impact*(.4+i*.04);p.position.z+=Math.sin(a)*impact*(.4+i*.04);p.position.y+=Math.sin(impact*Math.PI)*(.3+i%4*.2);p.scale.setScalar(kind==='cannon'?1+impact*3:1);p.material.opacity=(1-impact)*.85;}
      if(!ranged){ring.rotation.set(Math.PI*.18,0,t*6);ring.position.y=end.y+.3;ring.scale.setScalar(.45+impact*1.3);}
    };
  }
  function animate({before,after,action}) {
    if(disposed||!action)return Promise.resolve();
    if(animation)animation.finish();syncNow({game:before,selected:null,available:[],canInteract:false});setBusy(true);clearMarkers();
    const duration=reduced.matches?120:action.capture?1900:action.hit?1050:action.type==='chess'?950:850;
    const startTime=performance.now();let update=()=>{},completed=false;
    if(action.type==='chess') {
      const p=squareRecords.get(action.from),victim=squareRecords.get(action.epCapture??action.to),from=vector(squarePosition(action.from)),to=vector(squarePosition(action.to));
      const code=before.chess.board[action.from],capture=Boolean(action.capture),dir=to.clone().sub(from),facing=Math.atan2(dir.x,dir.z);
      if(p){p.root.rotation.y=facing;playClip(p,capture?'ATTACK':'MOVE',duration/1000*(capture ? .7 : 1));}
      p?.root.updateMatrixWorld(true);
      const origin=p?.emitter?p.emitter.getWorldPosition(new THREE.Vector3()):from.clone().add(new THREE.Vector3(0,code[1]==='Q'?1.5:1.05,0));
      const impact=vector(squarePosition(action.epCapture??action.to)).add(new THREE.Vector3(0,.65,0));
      const fx=capture?createAttackFx(code,origin,impact):null;
      let hit=false,defeated=false,moving=false;const rook=action.castle?squareRecords.get((code[0]==='w'?0:56)+(action.castle==='K'?7:0)):null;
      const rookFrom=rook?.root.position.clone(),rookTo=action.castle?vector(squarePosition((code[0]==='w'?0:56)+(action.castle==='K'?5:3))):null;
      if(rook)playClip(rook,'MOVE',duration/1000);
      update=t=>{
        if(!p)return;const move=capture?clamp((t-.6)/.4):t;p.root.position.copy(from).lerp(to,smooth(move));
        if(code[1]==='N')p.root.position.y+=Math.sin(move*Math.PI)*.95;
        fx?.(t);
        if(capture&&t>.48&&!hit){hit=true;playClip(victim,'HIT',.25);}
        if(capture&&t>.60&&!defeated){defeated=true;playClip(victim,'DEFEAT',.55);}
        if(capture&&t>.65&&!moving){moving=true;playClip(p,'MOVE',.65);}
        if(victim&&capture&&t>.66){const fade=clamp((t-.66)/.29);victim.root.scale.setScalar(1-fade*.98);victim.root.position.y-=.004;}
        if(rook)rook.root.position.copy(rookFrom).lerp(rookTo,smooth(t));
      };
    } else {
      const side=before.turn,source=checkers.filter(c=>c.visible&&c.userData.side===side&&c.userData.fleetHit.kind===(action.from==='bar'?'bar':'point')&&(action.from==='bar'||c.userData.fleetHit.n===action.from));
      const checker=source.at(-1),from=checker?.position.clone();
      const index=action.to==='off'?before.race.off[side]:action.hit?0:Math.abs(before.race.points[action.to]);
      const to=vector(action.to==='off'?reservePosition('off',side,index):pointPosition(action.to,index));
      const victim=action.hit?checkers.find(c=>c.visible&&c.userData.side!==side&&c.userData.fleetHit.kind==='point'&&c.userData.fleetHit.n===action.to):null;
      const victimFrom=victim?.position.clone(),victimTo=victim?vector(reservePosition('bar',victim.userData.side,before.race.bar[victim.userData.side])):null;
      update=t=>{if(checker){checker.position.copy(from).lerp(to,smooth(t));checker.position.y+=Math.sin(t*Math.PI)*.65;checker.rotation.y=t*Math.PI*2;}if(victim&&t>.5){const p=(t-.5)*2;victim.position.copy(victimFrom).lerp(victimTo,smooth(p));victim.position.y+=Math.sin(p*Math.PI)*.8;}};
    }
    return new Promise(resolve=>{
      const finish=()=>{
        if(completed)return;completed=true;animation=null;clearEffects();setBusy(false);
        if(!disposed){syncNow(pending||{game:after,selected:null,available:[],canInteract:false});pending=null;container.dataset.fleetLastAnimation=action.type==='chess'?(action.capture?captureEffect(before.chess.board[action.from]):'move-'+TYPES[before.chess.board[action.from][1]]):action.hit?'race-hit':action.to==='off'?'race-off':'race-move';}
        resolve();
      };
      animation={finish,update(now){const t=clamp((now-startTime)/duration);update(t);if(t>=1)finish();}};
      if(!canRun())finish();else wake();
    });
  }
  function dispose() {
    if(disposed)return;disposed=true;clearDice();animation?.finish();cancelAnimationFrame(frame);resizeObserver.disconnect();intersectionObserver.disconnect();document.removeEventListener('visibilitychange',visibility);controls.dispose();draco.dispose();clearEffects();
    const geometries=new Set(generatedGeometry),materials=new Set(generatedMaterial),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});
    for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const g of geometries)g.dispose();for(const t of textures)t.dispose();key.shadow.dispose();env.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();container.dataset.fleetState='disposed';
  }
  try {
    let loaded=0;const entries=[['board','board.glb'],['checker','checker.glb'],...PIECES.map(code=>[code,'pieces/'+code+'.glb'])];
    await Promise.all(entries.map(async([key,path])=>{const asset=await loader.loadAsync(new URL(path,ASSETS).href);templates.set(key,asset);container.dataset.fleetProgress=String(Math.round(++loaded/entries.length*100));}));
    if(disposed)throw new Error('Chargement 3D annulé.');
    boardGroup.add(templates.get('board').scene);
    boardGroup.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});renderer.shadowMap.needsUpdate=true;
    for(const side of ['w','b'])for(let i=0;i<15;i++)makeChecker(side);
    resize();setCamera(cameraMode);container.dataset.fleetState='ready';container.dataset.fleetAssetSource='blender-glb';container.dataset.fleetClips=String(PIECES.reduce((n,p)=>n+templates.get(p).animations.length,0));wake();
    return {sync,animate,animateDice,clearDice,dispose,resize,setCamera,focus:setCamera,setEnabled};
  } catch(error) {dispose();container.dataset.fleetState='error';throw new Error('Le décor 3D ne peut pas être chargé. Le plateau accessible reste disponible.',{cause:error});}
}
