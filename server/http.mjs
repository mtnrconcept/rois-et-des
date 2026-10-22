import {createServer as createNodeServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {constants,readFileSync,realpathSync} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {dirname,extname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MIME=new Map(Object.entries({
 '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.json':'application/json; charset=utf-8','.wasm':'application/wasm','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon',
 '.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'
}));
const ID='([A-Za-z0-9_-]{1,128})';
const TOP_LEVEL=new Set(['index.html','play.html','online.html','styles.css']);
const MUTATIONS=new Set(['POST','PUT','PATCH','DELETE']);
function failure(status,code,message){return Object.assign(new Error(message),{status,code});}
function equalSecret(actual,expected){if(typeof actual!=='string'||typeof expected!=='string'||actual.length>512)return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function cookieValue(request,name){const matches=(request.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${name}=`));if(matches.length!==1)return null;const token=matches[0].slice(name.length+1);return /^[A-Za-z0-9_-]{20,256}$/.test(token)?token:null;}
function requestPath(request){
 const raw=(request.url||'').split('?')[0];if(!raw.startsWith('/')||raw.startsWith('//')||raw.length>2048)throw failure(400,'INVALID_PATH','Adresse invalide.');
 let path;try{path=decodeURIComponent(raw);}catch{throw failure(400,'INVALID_PATH','Adresse invalide.');}
 if(/[\\\u0000-\u001f\u007f%]/.test(path)||path.split('/').some(part=>part==='..'||part==='.'))throw failure(400,'INVALID_PATH','Adresse invalide.');
 return path;
}
function allowedStatic(path){if(path.split('/').some(part=>part.startsWith('.')))return false;return TOP_LEVEL.has(path)||((path.startsWith('echgammon/')||path.startsWith('assets/'))&&MIME.has(extname(path)));}
function inlineScriptHashes(root){
 const hashes=new Set();
 for(const file of ['index.html','play.html','online.html']){
  let html;try{html=readFileSync(resolve(root,file),'utf8');}catch{continue;}
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(/\bsrc\s*=/i.test(match[1])||!match[2].trim())continue;hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);}
 }
 return [...hashes];
}
function readJSON(request,limit){
 if((request.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json'||(request.headers['content-encoding']&&request.headers['content-encoding']!=='identity')){request.resume();throw failure(415,'JSON_REQUIRED','Envoyez un objet JSON.');}
 const length=request.headers['content-length'];if(length&&(!/^\d+$/.test(length)||Number(length)>limit)){request.resume();throw failure(413,'BODY_TOO_LARGE','Le contenu envoyé est trop volumineux.');}
 return new Promise((resolveBody,reject)=>{
  let size=0;const chunks=[];const timer=setTimeout(()=>fail(failure(408,'REQUEST_TIMEOUT','Envoi trop lent. Réessayez.')),10000);timer.unref();
  const cleanup=()=>{clearTimeout(timer);request.off('data',onData);request.off('end',onEnd);request.off('error',onError);request.off('aborted',onAborted);};
  const fail=error=>{cleanup();request.resume();reject(error);},onError=()=>fail(failure(400,'INVALID_BODY','Envoi interrompu.')),onAborted=onError;
  const onData=chunk=>{size+=chunk.length;if(size>limit){fail(failure(413,'BODY_TOO_LARGE','Le contenu envoyé est trop volumineux.'));return;}chunks.push(chunk);};
  const onEnd=()=>{cleanup();try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();resolveBody(value);}catch{reject(failure(400,'INVALID_JSON','Le contenu JSON est invalide.'));}};
  request.on('data',onData);request.on('end',onEnd);request.on('error',onError);request.on('aborted',onAborted);
 });
}
export function clientAddress(request,{trustProxy=false,trustedProxyAddresses=[]}={}){
 const peer=request.socket.remoteAddress||'unknown';if(!trustProxy||!trustedProxyAddresses.includes(peer))return peer;
 const forwarded=request.headers['x-forwarded-for'];if(typeof forwarded!=='string'||forwarded.length>512)return peer;
 const addresses=forwarded.split(',').map(v=>v.trim());if(addresses.length>8||!addresses.length||!isIP(addresses.at(-1)))return peer;return addresses.at(-1);
}

export function createHttpServer({platform,root=ROOT,publicOrigin,production=false,trustProxy=false,trustedProxyAddresses=[],now=Date.now,health=()=>true,onError=()=>{}}={}){
 if(!platform)throw new TypeError('A platform is required.');
 const staticRoot=realpathSync(root);let configuredOrigin=null;
 if(publicOrigin){const parsed=new URL(publicOrigin);if(parsed.origin!==publicOrigin||!['http:','https:'].includes(parsed.protocol))throw new TypeError('PUBLIC_ORIGIN must be an exact origin.');configuredOrigin=parsed.origin;}
 if(production&&!configuredOrigin?.startsWith('https://'))throw new TypeError('Production requires an HTTPS PUBLIC_ORIGIN.');
 const cookieName=production?'__Host-rois_session':'rois_session';
 const csp=["default-src 'self'",`script-src 'self' 'wasm-unsafe-eval' ${inlineScriptHashes(staticRoot).join(' ')}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:","connect-src 'self'","worker-src 'self' blob:","media-src 'self' blob:","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'self'"].join('; ');
 const active=new Set();let pendingAuth=0;
 function headers(response){response.setHeader('Content-Security-Policy',csp);response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');response.setHeader('Referrer-Policy','same-origin');response.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');response.setHeader('Cross-Origin-Resource-Policy','same-origin');if(production)response.setHeader('Strict-Transport-Security','max-age=31536000');}
 function sendJSON(response,status,value){response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify(value));}
 function expectedOrigin(request){if(configuredOrigin)return configuredOrigin;const host=request.headers.host,port=server.address()?.port;if(![`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`].includes(host))throw failure(403,'INVALID_HOST','Hôte non autorisé.');return `http://${host}`;}
 function setSession(response,result,remember){if(!/^[A-Za-z0-9_-]{20,256}$/.test(result.token||''))throw new Error('Invalid session token');let cookie=`${cookieName}=${result.token}; Path=/; HttpOnly; SameSite=Strict`;if(production)cookie+='; Secure';if(remember===true)cookie+=`; Max-Age=${Math.max(0,Math.floor((result.expiresAt-now())/1000))}`;response.setHeader('Set-Cookie',cookie);}
 const routes=[
  {pattern:/^\/api\/health$/,public:true,methods:{GET:()=>({ok:health(),service:'rois-et-des'})}},
  {pattern:/^\/api\/session$/,public:true,methods:{GET:({session})=>session?{user:session.user,csrf:session.csrf}:{user:null}}},
  {pattern:/^\/api\/auth\/(register|login|recover)$/,public:true,authEntry:true,methods:{POST:async({data,match,response,token,rateKey})=>{if(pendingAuth>=8)throw failure(503,'AUTH_BUSY','Connexion momentanément occupée. Réessayez.');pendingAuth++;try{const result=await platform[match[1]](data,rateKey);if(token)platform.logout(token);setSession(response,result,data.remember);return {user:result.user,csrf:result.csrf,...(result.recoveryCode?{recoveryCode:result.recoveryCode}:{})};}finally{pendingAuth--;}}}},
  {pattern:/^\/api\/auth\/logout$/,methods:{POST:({token,response})=>{platform.logout(token);response.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production?'; Secure':''}`);return {};}}},
  {pattern:/^\/api\/profile$/,methods:{GET:({user})=>({user:platform.getProfile(user.id)}),PATCH:({user,data})=>({user:platform.updateProfile(user.id,data)})}},
  {pattern:/^\/api\/progress$/,methods:{GET:({user})=>platform.getProgress(user.id),PUT:({user,data})=>platform.saveProgress(user.id,data)}},
  {pattern:/^\/api\/matches$/,methods:{GET:({user})=>({matches:platform.listMatches(user.id)})}},
  {pattern:/^\/api\/rooms$/,methods:{POST:({user,data})=>({match:platform.createRoom(user.id,data)})}},
  {pattern:/^\/api\/rooms\/join$/,methods:{POST:({user,data})=>({match:platform.joinRoom(user.id,data)})}},
  {pattern:/^\/api\/queue$/,methods:{GET:({user})=>platform.queueStatus(user.id),POST:({user,data})=>platform.enqueue(user.id,data),DELETE:({user})=>platform.leaveQueue(user.id)}},
  {pattern:new RegExp(`^/api/matches/${ID}$`),methods:{GET:({user,match})=>({match:platform.getMatch(user.id,match[1])})}},
  {pattern:new RegExp(`^/api/matches/${ID}/commands$`),methods:{POST:({user,data,match})=>({match:platform.command(user.id,match[1],data)})}},
  {pattern:new RegExp(`^/api/matches/${ID}/replay$`),methods:{GET:({user,match})=>platform.getReplay(user.id,match[1])}},
  {pattern:/^\/api\/leaderboard$/,methods:{GET:()=>({players:platform.leaderboard()})}},
  {pattern:/^\/api\/tournaments$/,methods:{GET:({user})=>({tournaments:platform.listTournaments(user.id)}),POST:({user,data})=>({tournament:platform.createTournament(user.id,data)})}},
  {pattern:new RegExp(`^/api/tournaments/${ID}$`),methods:{GET:({user,match})=>({tournament:platform.getTournament(user.id,match[1])})}},
  {pattern:new RegExp(`^/api/tournaments/${ID}/(join|start|leave|cancel)$`),methods:{POST:({user,match})=>{const operations={join:'joinTournament',start:'startTournament',leave:'leaveTournament',cancel:'cancelTournament'};return {tournament:platform[operations[match[2]]](user.id,match[1])};}}},
  {pattern:/^\/api\/reports$/,methods:{POST:({user,data})=>({report:platform.report(user.id,data)})}},
  {pattern:/^\/api\/admin\/reports$/,methods:{GET:({user})=>({reports:platform.listReports(user.id)})}},
  {pattern:new RegExp(`^/api/admin/reports/${ID}$`),methods:{PATCH:({user,data,match})=>({report:platform.resolveReport(user.id,match[1],data)})}}
 ];
 async function serveStatic(request,response,path){
  if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');throw failure(405,'METHOD_NOT_ALLOWED','Méthode non autorisée.');}
  const local=path==='/'?'index.html':path.slice(1);if(!allowedStatic(local))throw failure(404,'NOT_FOUND','Ressource introuvable.');
  let file;
  try{
   const canonical=await realpath(resolve(staticRoot,local)),fromRoot=relative(staticRoot,canonical);
   if(isAbsolute(fromRoot)||fromRoot.startsWith(`..${sep}`)||!allowedStatic(fromRoot.split(sep).join('/')))throw failure(404,'NOT_FOUND','Ressource introuvable.');
   file=await open(canonical,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const stat=await file.stat();if(!stat.isFile())throw failure(404,'NOT_FOUND','Ressource introuvable.');
   response.statusCode=200;response.setHeader('Content-Type',MIME.get(extname(local))||'application/octet-stream');response.setHeader('Content-Length',stat.size);response.setHeader('Cache-Control',['.html','.mjs','.js'].includes(extname(local))?'no-cache':'public, max-age=3600');
   if(request.method==='HEAD'){await file.close();file=null;response.end();return;}
   const stream=file.createReadStream({autoClose:true});file=null;stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
  }catch(error){if(file)await file.close();if(['ENOENT','ENOTDIR','ELOOP','EACCES'].includes(error.code))throw failure(404,'NOT_FOUND','Ressource introuvable.');throw error;}
 }
 async function handle(request,response){
  headers(response);
  try{
   const path=requestPath(request);if(!path.startsWith('/api/')){await serveStatic(request,response,path);return;}
   response.setHeader('Cache-Control','no-store');const route=routes.find(candidate=>candidate.pattern.test(path));if(!route)throw failure(404,'NOT_FOUND','Ressource introuvable.');
   const handler=route.methods[request.method];if(!handler){response.setHeader('Allow',Object.keys(route.methods).join(', '));throw failure(405,'METHOD_NOT_ALLOWED','Méthode non autorisée.');}
   const rateKey=createHash('sha256').update(clientAddress(request,{trustProxy,trustedProxyAddresses})).digest('hex'),token=cookieValue(request,cookieName);let session=token?platform.authenticate(token):null;
   if(route.authEntry)platform.rateLimit(`http:auth:${rateKey}`,20,900000);else if(!session&&path!=='/api/health')platform.rateLimit(`http:read:${rateKey}`,600,60000);
   if(MUTATIONS.has(request.method)){if(request.headers.origin!==expectedOrigin(request))throw failure(403,'INVALID_ORIGIN','Origine de la requête non autorisée.');if(request.headers['sec-fetch-site']==='cross-site')throw failure(403,'INVALID_ORIGIN','Origine de la requête non autorisée.');}
   if(!route.public&&!session)throw failure(401,'AUTH_REQUIRED','Connectez-vous pour continuer.');
   if(!route.public){const write=MUTATIONS.has(request.method);platform.rateLimit(`http:${write?'write':'user-read'}:${session.user.id}`,write?120:240,60000);if(write&&!equalSecret(request.headers['x-csrf-token'],session.csrf))throw failure(403,'INVALID_CSRF','Session de formulaire périmée. Rechargez la page.');}
   const data=MUTATIONS.has(request.method)?await readJSON(request,path==='/api/progress'?65536:32768):{};
   if(!route.public&&MUTATIONS.has(request.method)){session=platform.authenticate(token);if(!session)throw failure(401,'AUTH_REQUIRED','Connectez-vous pour continuer.');if(!equalSecret(request.headers['x-csrf-token'],session.csrf))throw failure(403,'INVALID_CSRF','Session de formulaire périmée. Rechargez la page.');}
   const result=await handler({request,response,user:session?.user,session,token,data,match:path.match(route.pattern),rateKey});sendJSON(response,path==='/api/health'&&!result.ok?503:200,result??{});
  }catch(error){
   if(response.headersSent||response.destroyed){response.destroy();return;}
   const known=Number.isInteger(error.status)&&error.status>=400&&error.status<500,busy=error.status===503&&error.code==='AUTH_BUSY',status=known||busy?error.status:500;
   if(status===429||status===503)response.setHeader('Retry-After',status===429?'60':'5');if([408,413,415].includes(status))response.setHeader('Connection','close');if(!known&&!busy)onError({event:'http_request_failed',code:'INTERNAL_ERROR'});
   sendJSON(response,status,{error:{code:known||busy?error.code||'REQUEST_FAILED':'INTERNAL_ERROR',message:known||busy?String(error.message).slice(0,300):'Le service rencontre une difficulté. Réessayez.'}});
  }
 }
 const server=createNodeServer({maxHeaderSize:16384,requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:5000},(request,response)=>{const task=handle(request,response);active.add(task);task.finally(()=>active.delete(task));});
 server.maxRequestsPerSocket=1000;server.waitForHandlers=()=>Promise.allSettled([...active]);
 server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 return server;
}
