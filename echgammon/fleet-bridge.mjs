/** Presentation lifecycle only. game.mjs remains the sole authority for rules. */
export function watchFleetContextLoss(container,{isCurrent,onFailure}) {
  // webglcontextlost does not bubble: listen during capture, including startup.
  const lost=event=>{if(!isCurrent())return;event.preventDefault();onFailure();};
  container.addEventListener('webglcontextlost',lost,{capture:true,once:true});
  return ()=>container.removeEventListener('webglcontextlost',lost,{capture:true});
}

export function createFleetBridge({getState,onBusy=()=>{},onError=()=>{}}) {
  let renderer=null,serial=0,busy=false;
  function setBusy(value){if(busy!==value){busy=value;onBusy(value);}}
  function sync(){if(renderer&&!busy)try{renderer.sync(getState());}catch(error){onError(error);}}
  function dispose(){
    serial++;const old=renderer;renderer=null;
    try{old?.dispose();}finally{setBusy(false);}
  }
  function attach(next){dispose();renderer=next;sync();}
  async function run(method,payload){
    if(!renderer)return false;
    if(busy)throw new Error('Une animation est déjà en cours.');
    const current=renderer,token=++serial;
    setBusy(true);
    try{const result=await current[method](payload);return token===serial&&result!==false;}
    catch(error){if(token===serial)onError(error);return false;}
    finally{if(token===serial){setBusy(false);sync();}}
  }
  return {attach,dispose,sync,animate:transition=>run('animate',transition),animateDice:payload=>run('animateDice',payload),
    clearDice(){renderer?.clearDice?.();},get busy(){return busy;},get active(){return Boolean(renderer);},
    resize(){try{renderer?.resize();}catch(error){onError(error);}},
    setCamera(mode){try{renderer?.setCamera?.(mode);}catch(error){onError(error);}}};
}
