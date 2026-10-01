import {analyze} from './analysis.mjs';
self.onmessage=event=>{
 const {requestId,game,options}=event.data||{};
 try{
  const result=analyze(game,{...options,onProgress:progress=>self.postMessage({requestId,type:'progress',progress})});
  self.postMessage({requestId,type:'result',result});
 }catch(error){self.postMessage({requestId,type:'error',message:String(error?.message||error)});}
};
