export function boardObstacles(board){
  const heights={P:.99,N:1.29,B:1.40,R:1.44,Q:1.59,K:1.65};
  return board.flatMap((code,n)=>code?[{x:(n%8-3.5)*1.1,z:(3.5-Math.floor(n/8))*1.1,radius:.37,height:heights[code[1]]}]:[]);
}

/** A cancelled simulation cannot deliver a second roll to a reset game. */
export function simulateRoll(options,{signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Lancer annulé','AbortError'));return;}
    const worker=new Worker(new URL('./dice-worker.mjs',import.meta.url),{type:'module'});
    let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timeout);worker.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    const abort=()=>finish(new DOMException('Lancer annulé','AbortError'));
    const timeout=setTimeout(()=>finish(new Error('La simulation prend trop de temps. Réessayez le lancer.')),15000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>data.error?finish(new Error(data.error)):finish(null,data.result);
    worker.onerror=()=>finish(new Error('La simulation des dés n’a pas pu démarrer. Réessayez le lancer.'));
    worker.postMessage(options);
  });
}
