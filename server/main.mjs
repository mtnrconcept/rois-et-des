import {mkdirSync,realpathSync,statfsSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Platform} from './platform.mjs';
import {createHttpServer} from './http.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const host=process.env.HOST||'127.0.0.1';
const port=Number(process.env.PORT||3000);
const production=process.env.NODE_ENV==='production';
const databasePath=process.env.DATABASE_PATH||resolve(root,'data/rois-et-des.sqlite');
const publicOrigin=process.env.PUBLIC_ORIGIN||(production?null:`http://127.0.0.1:${port}`);
const adminUsernames=(process.env.ADMIN_USERNAMES||'').split(',').map(v=>v.trim()).filter(Boolean);
const trustProxy=process.env.TRUST_PROXY==='1';
const trustedProxyAddresses=(process.env.TRUSTED_PROXY_ADDRESSES||'').split(',').map(v=>v.trim()).filter(Boolean);
let platform,server,ticker,stopping=false;

function validate(){
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 if(!isAbsolute(databasePath))throw new Error('DATABASE_PATH must be absolute in production.');
 if(production){
  if(!publicOrigin?.startsWith('https://'))throw new Error('PUBLIC_ORIGIN must use HTTPS in production.');
  const persistent=process.env.PERSISTENT_DATA_DIR;
  if(!persistent||!isAbsolute(persistent))throw new Error('PERSISTENT_DATA_DIR must name the mounted production volume.');
  mkdirSync(dirname(databasePath),{recursive:true,mode:0o700});
  const dir=realpathSync(dirname(databasePath)),volume=realpathSync(persistent),fromVolume=relative(volume,dir),fromRoot=relative(root,dir);
  if(fromVolume.startsWith(`..${sep}`)||isAbsolute(fromVolume)||!fromRoot.startsWith('..')||dir.startsWith('/tmp/'))throw new Error('DATABASE_PATH must live on the declared persistent volume, outside the repository and /tmp.');
  try{statfsSync(volume);}catch{throw new Error('The declared persistent volume is not mounted.');}
  if(trustProxy&&!trustedProxyAddresses.length)throw new Error('TRUST_PROXY requires explicit TRUSTED_PROXY_ADDRESSES.');
 }
}
async function stop(signal){
 if(stopping)return;stopping=true;clearInterval(ticker);console.log(JSON.stringify({event:'shutdown',signal}));
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 await server?.waitForHandlers?.();try{platform?.close();}finally{process.exit(0);}
}
try{
 validate();platform=new Platform({path:databasePath,adminUsernames});
 platform.tick();
 server=createHttpServer({platform,root,publicOrigin,production,trustProxy,trustedProxyAddresses,onError:event=>console.error(JSON.stringify(event))});
 server.on('error',error=>{console.error(JSON.stringify({event:'server_error',code:error.code||'SERVER_ERROR'}));if(!stopping)process.exitCode=1;});
 server.listen(port,host,()=>console.log(JSON.stringify({event:'server_started',host,port,production,database:production?'persistent':'development'})));
 ticker=setInterval(()=>{try{platform.tick();}catch{console.error(JSON.stringify({event:'platform_tick_failed'}));}},5000);ticker.unref();
 process.on('SIGTERM',()=>void stop('SIGTERM'));process.on('SIGINT',()=>void stop('SIGINT'));
 process.on('uncaughtException',()=>{console.error(JSON.stringify({event:'uncaught_exception'}));void stop('uncaughtException');});
 process.on('unhandledRejection',()=>{console.error(JSON.stringify({event:'unhandled_rejection'}));void stop('unhandledRejection');});
}catch(error){console.error(JSON.stringify({event:'startup_failed',message:error.message}));process.exit(1);}
