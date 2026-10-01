import * as THREE from '../assets/fleet/vendor/three.module.js';

// BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z.
const FACE_VALUES=[3,4,1,6,2,5];
const PIPS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]]};
function faceTexture(value,side){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d');c.fillStyle=side?'#f3e7ce':'#fff3d8';c.fillRect(0,0,128,128);
  c.strokeStyle='#be985f';c.lineWidth=2;c.strokeRect(7,7,114,114);
  c.fillStyle=side?'#163f62':'#7b202e';
  for(const [x,y] of PIPS[value]){c.beginPath();c.arc(64+x*29,64+y*29,10,0,Math.PI*2);c.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createDiceVisuals(){
  const group=new THREE.Group();group.name='PhysicalDice';
  const geometry=new THREE.BoxGeometry(.58,.58,.58,6,6,6),positions=geometry.attributes.position;
  const p=new THREE.Vector3(),core=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){
    p.fromBufferAttribute(positions,i);core.copy(p).clampScalar(-.25,.25);
    p.sub(core).normalize().multiplyScalar(.04).add(core);positions.setXYZ(i,p.x,p.y,p.z);
  }
  geometry.computeVertexNormals();
  const textures=[],materials=[],dice=[];
  for(let n=0;n<2;n++){
    const mats=FACE_VALUES.map(value=>{const map=faceTexture(value,n);textures.push(map);const m=new THREE.MeshStandardMaterial({map,roughness:.32,metalness:.06});materials.push(m);return m;});
    const mesh=new THREE.Mesh(geometry,mats);mesh.name='PhysicalDie'+(n+1);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);dice.push(mesh);
  }
  return {group,dice,
    setFrame(frame){frame.dice.forEach((pose,i)=>{dice[i].position.fromArray(pose.position);dice[i].quaternion.fromArray(pose.quaternion);});},
    dispose(){group.removeFromParent();geometry.dispose();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  };
}

/** Replay the recorded rigid-body states, without steering the final orientation. */
export function playDiceFrames({result,visuals,draw,signal,reducedMotion=false,onCollision=()=>{}}){
  return new Promise((resolve,reject)=>{
    let frame=0,start=null,index=0,hitIndex=0,done=false;
    const duration=reducedMotion ? .18 : result.duration+.55;
    const finish=(completed,error)=>{if(done)return;done=true;cancelAnimationFrame(frame);signal?.removeEventListener('abort',abort);error?reject(error):resolve(completed);};
    const abort=()=>finish(false);
    if(signal?.aborted){finish(false);return;}signal?.addEventListener('abort',abort,{once:true});
    function tick(now){
      try{
      if(done)return;start??=now;const elapsed=(now-start)/1000;
      const t=reducedMotion?result.duration:Math.min(elapsed,result.duration);
      while(index<result.frames.length-1&&result.frames[index+1].t<=t)index++;
      const a=result.frames[index],b=result.frames[Math.min(index+1,result.frames.length-1)];
      const mix=b.t>a.t?Math.min(1,(t-a.t)/(b.t-a.t)):0;
      for(let i=0;i<2;i++){
        const mesh=visuals.dice[i],pa=a.dice[i],pb=b.dice[i];
        mesh.position.fromArray(pa.position).lerp(new THREE.Vector3(...pb.position),mix);
        mesh.quaternion.fromArray(pa.quaternion).slerp(new THREE.Quaternion(...pb.quaternion),mix);
      }
      while(hitIndex<result.collisions.length&&result.collisions[hitIndex].t<=t){const hit=result.collisions[hitIndex++];if(!reducedMotion&&hit.speed>.6)onCollision(hit);}
      draw();
      if(elapsed>=duration){visuals.setFrame(result.frames.at(-1));draw();finish(true);}else frame=requestAnimationFrame(tick);
      }catch(error){finish(false,error);}
    }
    frame=requestAnimationFrame(tick);
  });
}

/** Transparent 3D canvas in the classic board's chess frame. */
export function createDiceOverlay(anchor){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const canvas=renderer.domElement;canvas.dataset.diceCanvas='';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8;';anchor.append(canvas);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,40);
  camera.position.set(0,14.6,.001);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xfff3da,0x473529,2.4));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,9,4);light.castShadow=true;light.shadow.mapSize.set(512,512);
  Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});light.shadow.bias=-.001;scene.add(light);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(8.8,8.8),new THREE.ShadowMaterial({opacity:.22}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const visuals=createDiceVisuals();scene.add(visuals.group);let disposed=false,contextLost=false;
  const loseContext=event=>{event.preventDefault();contextLost=true;};canvas.addEventListener('webglcontextlost',loseContext);
  function draw(){if(contextLost)throw new Error('Le rendu des dés est indisponible.');if(!disposed)renderer.render(scene,camera);}
  const resize=()=>{if(disposed||contextLost)return;renderer.setSize(Math.max(1,anchor.clientWidth),Math.max(1,anchor.clientHeight),false);draw();};
  const observer=new ResizeObserver(resize);observer.observe(anchor);resize();
  return {async play(result,options){canvas.dataset.diceValues=result.values.join(',');return playDiceFrames({result,visuals,draw,...options});},
    dispose(){if(disposed)return;disposed=true;observer.disconnect();canvas.removeEventListener('webglcontextlost',loseContext);visuals.dispose();ground.geometry.dispose();ground.material.dispose();light.shadow.map?.dispose();canvas.remove();renderer.dispose();renderer.forceContextLoss();}
  };
}
