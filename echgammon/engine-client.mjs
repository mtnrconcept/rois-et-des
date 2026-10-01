import {analyze,analysisKey} from './analysis.mjs';
import {actions} from './game.mjs';
const abortError=()=>Object.assign(new Error('Analyse annulée.'),{name:'AbortError'});
/** One cancellable calculation. Workers are terminated, not merely ignored. */
export function createEngineClient({workerFactory=()=>new Worker(new URL('./analysis-worker.mjs',import.meta.url),{type:'module'})}={}){
 let active=null,sequence=0;
 function cancel(){if(!active)return;const a=active;active=null;clearTimeout(a.timer);clearTimeout(a.fallbackTimer);a.worker?.terminate();a.reject(abortError());}
 function request(g,options={}){
  cancel();const {onProgress,...parameters}=options,key=analysisKey(g),requestId=++sequence;
  const limit=Math.min(15000,Math.max(0,Number(parameters.timeMs)||2500));
  return new Promise((resolve,reject)=>{
   const a={resolve,reject,worker:null,timer:null,fallbackTimer:null,failed:false};active=a;
   const finish=result=>{if(active!==a)return;active=null;clearTimeout(a.timer);a.worker?.terminate();resolve(result);};
   const fallback=()=>{
    if(active!==a||a.failed)return;a.failed=true;clearTimeout(a.timer);a.worker?.terminate();
    a.fallbackTimer=setTimeout(()=>{if(active!==a)return;try{finish({...analyze(g,{timeMs:90,maxNodes:180,rootWidth:3,turnWidth:1,replyWidth:1}),fallback:true});}catch(error){active=null;reject(error);}},0);
   };
   try{
    a.worker=workerFactory();
    a.worker.onmessage=event=>{
     if(active!==a||event.data?.requestId!==requestId)return;
     const message=event.data;
     if(message.type==='progress'){onProgress?.(message.progress);return;}
     if(message.type==='error'){fallback();return;}
     if(message.type!=='result')return;const r=message.result;
     if(r?.key!==key||r.revision!==g.revision||r.actionId&&!actions(g).some(m=>m.id===r.actionId)){fallback();return;}
     finish(r);
    };
    a.worker.onerror=event=>{event.preventDefault?.();fallback();};
    a.worker.onmessageerror=fallback;
    a.timer=setTimeout(fallback,limit+1800);
    a.worker.postMessage({requestId,key,game:g,options:{...parameters,timeMs:limit}});
   }catch{fallback();}
  });
 }
 return {analyze:request,cancel,get busy(){return Boolean(active);}};
}
