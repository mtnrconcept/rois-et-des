import {randomBytes,randomInt,randomUUID,createHash,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {Database} from './database.mjs';
import {createGame,roll,play,actions,VERSION} from '../echgammon/game.mjs';
import {DEFAULT_RATING,updateRatings,createSingleElimination} from '../echgammon/competitive.mjs';
import {createProgress} from '../echgammon/progress.mjs';
import {EXERCISES,LESSONS,BOTS} from '../echgammon/catalog.mjs';

const scrypt=promisify(scryptCallback);
const HASH_OPTIONS={N:32768,r:8,p:1,maxmem:64*1024*1024};
const HOUR=3600000,DAY=24*HOUR,SESSION=12*HOUR,REMEMBER=30*DAY;
const QUEUE_TTL=45000,ROOM_TTL=10*60000,OPENING_TTL=60000,INCREMENT=2000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const json=value=>JSON.stringify(value);
const parsed=value=>value?JSON.parse(value):null;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const own=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'));
export const secureDice=()=>[randomInt(1,7),randomInt(1,7)];

function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
function requireObject(value,keys){if(!own(value,keys))fail(400,'INVALID_INPUT','Les données envoyées sont invalides.');return value;}
function text(value,min,max,label){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value))fail(400,'INVALID_INPUT',`${label} invalide.`);return value.trim();}
function paragraph(value,min,max,label){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail(400,'INVALID_INPUT',`${label} invalide.`);return value.trim();}
function username(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_]{3,24}$/.test(value))fail(400,'INVALID_INPUT','Identifiant : 3 à 24 lettres, chiffres ou caractères soulignés.');return value.toLowerCase();}
function password(value){if(typeof value!=='string'||[...value].length<12||Buffer.byteLength(value,'utf8')>256)fail(400,'INVALID_INPUT','Le mot de passe doit contenir au moins 12 caractères et au plus 256 octets.');return value;}
function remember(value){if(value!==undefined&&typeof value!=='boolean')fail(400,'INVALID_INPUT','Préférence de session invalide.');return value===true;}
function timeControl(value=600){if(!Number.isInteger(value)||value<60||value>3600)fail(400,'INVALID_INPUT','La cadence doit être comprise entre 60 et 3 600 secondes.');return value;}
function identifier(value){if(typeof value!=='string'||value.length<1||value.length>128)fail(400,'INVALID_INPUT','Identifiant invalide.');return value;}
async function hashPassword(value){const salt=randomBytes(16).toString('hex'),hash=await scrypt(value,salt,64,HASH_OPTIONS);return `scrypt-v1$${salt}$${hash.toString('hex')}`;}
async function verifyPassword(value,stored){
 const parts=typeof stored==='string'?stored.split('$'):[];
 const valid=parts.length===3&&parts[0]==='scrypt-v1'&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);
 const computed=await scrypt(value,valid?parts[1]:'00000000000000000000000000000000',64,HASH_OPTIONS);
 return timingSafeEqual(computed,valid?Buffer.from(parts[2],'hex'):Buffer.alloc(64))&&valid;
}
function sanitizeProgress(p){
 requireObject(p,['version','exercises','lessons','games','activeDays']);
 if(p.version!==1||!plain(p.exercises)||!plain(p.lessons)||!Array.isArray(p.games)||p.games.length>50||!Array.isArray(p.activeDays)||p.activeDays.length>90||Buffer.byteLength(json(p))>32768)fail(400,'INVALID_PROGRESS','Progression invalide.');
 const next=createProgress();
 for(const [id,result] of Object.entries(p.exercises)){
  if(!EXERCISES.some(e=>e.id===id)||!own(result,['stars','date'])||!Number.isInteger(result.stars)||result.stars<0||result.stars>3||!validDate(result.date))fail(400,'INVALID_PROGRESS','Résultat d’exercice invalide.');
  next.exercises[id]={stars:result.stars,date:result.date};
 }
 for(const [id,date] of Object.entries(p.lessons)){if(!LESSONS.some(l=>l.id===id)||!validDate(date))fail(400,'INVALID_PROGRESS','Leçon invalide.');next.lessons[id]=date;}
 const ids=new Set();
 next.games=p.games.map(g=>{
  if(!own(g,['id','bot','winner','humanSide','reason','turns','date'])||typeof g.id!=='string'||g.id.length<1||g.id.length>=100||ids.has(g.id)||![...BOTS.map(b=>b.id),'local'].includes(g.bot)||!['w','b','draw'].includes(g.winner)||!['w','b'].includes(g.humanSide)||!['mat','course','nulle'].includes(g.reason)||!Number.isInteger(g.turns)||g.turns<0||g.turns>400||!validDate(g.date))fail(400,'INVALID_PROGRESS','Partie d’entraînement invalide.');
  ids.add(g.id);return {...g};
 });
 if(!p.activeDays.every(validDate))fail(400,'INVALID_PROGRESS','Date de progression invalide.');
 next.activeDays=[...new Set(p.activeDays)].sort();return next;
}

export class Platform {
 constructor({path=':memory:',now=Date.now,dice=secureDice,adminUsernames=[]}={}){
  this.db=new Database(path);this.now=now;this.dice=dice;this.adminUsernames=new Set(adminUsernames.map(username));
 }
 close(){this.db.close();}
 rateLimit(key,limit,windowMs){
  if(typeof key!=='string'||key.length>1024||!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1)throw new TypeError('Invalid rate limit configuration.');
  const now=this.now(),hash=digest(key);
  const accepted=this.db.transaction(()=>{
   const row=this.db.get('SELECT window_at,hits FROM rate_limits WHERE key=?',hash);
   if(!row||now-row.window_at>=windowMs||now<row.window_at){this.db.run('INSERT INTO rate_limits(key,window_at,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_at=excluded.window_at,hits=1',hash,now);return true;}
   if(row.hits>=limit)return false;
   this.db.run('UPDATE rate_limits SET hits=hits+1 WHERE key=?',hash);return true;
  });
  if(!accepted)fail(429,'RATE_LIMITED','Trop de tentatives. Réessayez plus tard.');return true;
 }
 _authLimit(kind,key,name){this.rateLimit(`${kind}:source:${String(key??'unknown').slice(0,200)}`,kind==='register'?10:40,15*60000);if(name)this.rateLimit(`${kind}:name:${name}`,10,15*60000);}
 _user(id){const row=this.db.get('SELECT * FROM users WHERE id=?',identifier(id));if(!row)fail(404,'USER_NOT_FOUND','Profil introuvable.');return row;}
 _profile(row){return {id:row.id,username:row.username,displayName:row.display_name,bio:row.bio,rating:row.rating,ratedGames:row.rated_games,wins:row.wins,losses:row.losses,draws:row.draws,createdAt:row.created_at,isAdmin:this.adminUsernames.has(row.username)};}
 _audit(actorId,kind,resourceId,data={}){this.db.run('INSERT INTO audit_events(actor_id,kind,resource_id,data_json,created_at) VALUES(?,?,?,?,?)',actorId,kind,resourceId,json(data),this.now());}
 _session(user,keep){
  const token=secret(),csrf=secret(),now=this.now(),expiresAt=now+(keep?REMEMBER:SESSION);
  this.db.run('DELETE FROM sessions WHERE expires_at<=?',now);
  this.db.run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)',digest(token),user.id,csrf,expiresAt,now);
  this.db.run('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 8)',user.id,user.id);
  return {user:this._profile(user),token,csrf,expiresAt};
 }
 async register(input,rateKey){
  requireObject(input,['username','displayName','password','remember']);
  const name=username(input.username),displayName=text(input.displayName,2,40,'Nom public'),pass=password(input.password),keep=remember(input.remember);
  this._authLimit('register',rateKey,name);
  if(this.adminUsernames.has(name))fail(409,'USERNAME_RESERVED','Cet identifiant est réservé.');
  if(this.db.get('SELECT id FROM users WHERE username=?',name))fail(409,'USERNAME_TAKEN','Cet identifiant est déjà utilisé.');
  const encoded=await hashPassword(pass),recoveryCode=secret(),id=randomUUID();
  return this.db.transaction(()=>{
   if(this.db.get('SELECT id FROM users WHERE username=?',name))fail(409,'USERNAME_TAKEN','Cet identifiant est déjà utilisé.');
   this.db.run('INSERT INTO users(id,username,display_name,password_hash,recovery_hash,rating,created_at) VALUES(?,?,?,?,?,?,?)',id,name,displayName,encoded,digest(recoveryCode),DEFAULT_RATING,this.now());
   this.db.run('INSERT INTO progress(user_id,data_json,revision) VALUES(?,?,0)',id,json(createProgress()));
   this._audit(id,'account.registered',id);return {...this._session(this._user(id),keep),recoveryCode};
  });
 }
 async login(input,rateKey){
  requireObject(input,['username','password','remember']);
  const name=username(input.username),pass=password(input.password),keep=remember(input.remember);
  this._authLimit('login',rateKey,name);
  const user=this.db.get('SELECT * FROM users WHERE username=?',name),valid=await verifyPassword(pass,user?.password_hash);
  if(!user||!valid)fail(401,'INVALID_CREDENTIALS','Identifiant ou mot de passe incorrect.');
  return this.db.transaction(()=>{const current=this._user(user.id);if(current.password_hash!==user.password_hash)fail(401,'INVALID_CREDENTIALS','Identifiant ou mot de passe incorrect.');this._audit(user.id,'session.created',user.id);return this._session(current,keep);});
 }
 async recover(input,rateKey){
  requireObject(input,['username','recoveryCode','password','remember']);
  const name=username(input.username),pass=password(input.password),keep=remember(input.remember);
  this._authLimit('recover',rateKey,name);
  const user=this.db.get('SELECT * FROM users WHERE username=?',name),code=input.recoveryCode;
  if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code)||!user||!safeEqual(digest(code),user.recovery_hash))fail(401,'INVALID_CREDENTIALS','Identifiant ou code de récupération incorrect.');
  const encoded=await hashPassword(pass),recoveryCode=secret();
  return this.db.transaction(()=>{
   const current=this._user(user.id);if(!safeEqual(current.recovery_hash,user.recovery_hash))fail(401,'INVALID_CREDENTIALS','Identifiant ou code de récupération incorrect.');
   this.db.run('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?',encoded,digest(recoveryCode),user.id);
   this.db.run('DELETE FROM sessions WHERE user_id=?',user.id);this._audit(user.id,'account.recovered',user.id);
   return {...this._session(this._user(user.id),keep),recoveryCode};
  });
 }
 authenticate(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const row=this.db.get('SELECT user_id,csrf,expires_at FROM sessions WHERE token_hash=?',digest(token));
  if(!row||row.expires_at<=this.now())return null;
  return {user:this.getProfile(row.user_id),csrf:row.csrf,expiresAt:row.expires_at};
 }
 logout(token){if(typeof token==='string'&&token.length<=256)this.db.run('DELETE FROM sessions WHERE token_hash=?',digest(token));return {ok:true};}
 getProfile(userId){return this._profile(this._user(userId));}
 updateProfile(userId,input){
  this._user(userId);requireObject(input,['displayName','bio']);
  const displayName=text(input.displayName,2,40,'Nom public'),bio=text(input.bio??'',0,280,'Présentation');
  this.rateLimit(`profile:${userId}`,30,60000);this.db.run('UPDATE users SET display_name=?,bio=? WHERE id=?',displayName,bio,userId);return this.getProfile(userId);
 }
 getProgress(userId){this._user(userId);const row=this.db.get('SELECT data_json,revision FROM progress WHERE user_id=?',userId);return {progress:row?parsed(row.data_json):createProgress(),revision:row?.revision??0};}
 saveProgress(userId,input){
  this._user(userId);requireObject(input,['progress','expectedRevision']);
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail(400,'INVALID_REVISION','Révision invalide.');
  const progress=sanitizeProgress(input.progress);this.rateLimit(`progress:${userId}`,60,60000);
  return this.db.transaction(()=>{const current=this.getProgress(userId);if(current.revision!==input.expectedRevision)fail(409,'STALE_PROGRESS','La progression a changé sur un autre appareil. Rechargez-la avant de réessayer.');this.db.run('INSERT INTO progress(user_id,data_json,revision) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,revision=excluded.revision',userId,json(progress),current.revision+1);return {progress,revision:current.revision+1};});
 }
 _match(id){const row=this.db.get('SELECT * FROM matches WHERE id=?',identifier(id));if(!row)fail(404,'MATCH_NOT_FOUND','Partie introuvable.');return row;}
 _member(row,userId){if(row.white_id!==userId&&row.black_id!==userId)fail(403,'FORBIDDEN','Cette partie est réservée à ses participants.');return row.white_id===userId?'w':'b';}
 _busy(userId){return this.db.get('SELECT kind,resource_id FROM engagements WHERE user_id=?',userId);}
 _requireFree(userId){if(this._busy(userId))fail(409,'PLAYER_BUSY','Terminez votre partie ou quittez la file avant de continuer.');}
 _occupy(userId,kind,id){this.db.run('INSERT INTO engagements(user_id,kind,resource_id) VALUES(?,?,?)',userId,kind,id);}
 _releaseMatch(row){this.db.run("DELETE FROM engagements WHERE kind='match' AND resource_id=?",row.id);}
 _clock(row){
  const at=this.now(),elapsed=row.status==='active'&&row.running?Math.max(0,at-row.clock_at):0;
  return {wMs:Math.max(0,row.white_ms-(row.running==='w'?elapsed:0)),bMs:Math.max(0,row.black_ms-(row.running==='b'?elapsed:0)),running:row.status==='active'?row.running:null,asOf:at};
 }
 _snapshot(row,userId){
  const side=this._member(row,userId),state=parsed(row.state_json),snapshot={id:row.id,revision:row.revision,status:row.status,game:state,players:{w:this.getProfile(row.white_id),b:row.black_id?this.getProfile(row.black_id):null},yourSide:side,ranked:Boolean(row.ranked),timeControl:row.time_control,clocks:this._clock(row),result:parsed(row.result_json),tournamentId:row.tournament_id,createdAt:row.created_at,rulesVersion:state.version};
  if(row.status==='waiting'&&side==='w')snapshot.joinCode=row.join_code;
  if(row.status==='active'&&state.phase==='opening')snapshot.openingDeadline=row.opening_deadline;
  return snapshot;
 }
 _writeMatch(row){
  row.updated_at=this.now();
  this.db.run('UPDATE matches SET black_id=?,status=?,state_json=?,revision=?,white_ms=?,black_ms=?,running=?,clock_at=?,opening_deadline=?,waiting_expires=?,result_json=?,rated_settled=?,updated_at=? WHERE id=?',row.black_id,row.status,row.state_json,row.revision,row.white_ms,row.black_ms,row.running,row.clock_at,row.opening_deadline,row.waiting_expires,row.result_json,row.rated_settled,row.updated_at,row.id);
 }
 _event(row,type,actorId,details={}){
  const state=parsed(row.state_json),sequence=this.db.get('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM match_events WHERE match_id=?',row.id).next;
  const event={sequence,revision:row.revision,type,actorId,at:this.now(),...details,stateHash:digest(json(state)),rulesVersion:state.version};
  if(row.result_json)event.result=parsed(row.result_json);
  this.db.run('INSERT INTO match_events(match_id,sequence,event_json) VALUES(?,?,?)',row.id,sequence,json(event));
 }
 _newMatch(white,black,{ranked=false,timeControl:seconds=600,joinCode=null,tournamentId=null,round=null,slot=null,drawIndex=0}={}){
  const id=randomUUID(),now=this.now(),active=Boolean(black);
  this.db.run('INSERT INTO matches(id,white_id,black_id,ranked,join_code,status,state_json,time_control,white_ms,black_ms,clock_at,opening_deadline,waiting_expires,tournament_id,tournament_round,tournament_slot,draw_index,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,white,black,ranked?1:0,joinCode,active?'active':'waiting',json(createGame()),seconds,seconds*1000,seconds*1000,now,active?now+OPENING_TTL:null,active?null:now+ROOM_TTL,tournamentId,round,slot,drawIndex,now,now);
  this._audit(white,'match.created',id,{ranked,tournamentId});return this._match(id);
 }
 _finish(row,winner,reason,type,actorId=null,details={}){
  if(row.status!=='active')return row;
  row.status='ended';row.running=null;row.clock_at=this.now();
  const result={winner,reason};
  if(row.ranked&&!row.rated_settled){
   const w=this._user(row.white_id),b=this._user(row.black_id),outcome=winner==='draw'?0.5:winner==='w'?1:0,ratings=updateRatings(w.rating,b.rating,outcome);
   this.db.run('UPDATE users SET rating=?,rated_games=rated_games+1,wins=wins+?,losses=losses+?,draws=draws+? WHERE id=?',ratings.a,winner==='w'?1:0,winner==='b'?1:0,winner==='draw'?1:0,w.id);
   this.db.run('UPDATE users SET rating=?,rated_games=rated_games+1,wins=wins+?,losses=losses+?,draws=draws+? WHERE id=?',ratings.b,winner==='b'?1:0,winner==='w'?1:0,winner==='draw'?1:0,b.id);
   result.ratingChanges={w:{before:w.rating,after:ratings.a,delta:ratings.a-w.rating},b:{before:b.rating,after:ratings.b,delta:ratings.b-b.rating}};
   this._audit(null,'rating.settled',row.id,result.ratingChanges);
  }
  row.rated_settled=1;row.result_json=json(result);this._writeMatch(row);this._event(row,type,actorId,details);this._releaseMatch(row);
  this._audit(actorId,'match.ended',row.id,{winner,reason});
  if(row.tournament_id)this._advanceTournament(row);
  return row;
 }
 _refreshRow(row){
  const now=this.now();
  if(row.status==='waiting'&&now>=row.waiting_expires){row.status='cancelled';row.revision++;row.running=null;this._writeMatch(row);this._event(row,'cancel',null,{reason:'room-expired'});this._releaseMatch(row);}
  if(row.status!=='active')return row;
  const state=parsed(row.state_json),clock=this._clock(row);
  if(state.phase==='opening'&&now>=row.opening_deadline){row.revision++;return this._finish(row,'b','opening-timeout','timeout',null,{loser:'w'});}
  if(row.running&&clock[row.running==='w'?'wMs':'bMs']<=0){const loser=row.running;row.white_ms=clock.wMs;row.black_ms=clock.bMs;row.revision++;return this._finish(row,loser==='w'?'b':'w','timeout','timeout',null,{loser});}
  return row;
 }
 _cleanupQueue(){
  const cutoff=this.now()-QUEUE_TTL;
  this.db.run("DELETE FROM engagements WHERE kind='queue' AND user_id IN (SELECT user_id FROM queue WHERE heartbeat_at<?)",cutoff);
  this.db.run('DELETE FROM queue WHERE heartbeat_at<?',cutoff);
 }
 tick(){
  return this.db.transaction(()=>{
   this._cleanupQueue();
   const rows=this.db.all("SELECT * FROM matches WHERE status IN ('waiting','active')");
   for(const row of rows)this._refreshRow(row);
   this.db.run('DELETE FROM sessions WHERE expires_at<=?',this.now());
   this.db.run('DELETE FROM rate_limits WHERE window_at<?',this.now()-2*DAY);
   return {checked:rows.length};
  });
 }
 listMatches(userId){this._user(userId);this.tick();return this.db.all('SELECT * FROM matches WHERE white_id=? OR black_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100',userId,userId).map(row=>this._snapshot(row,userId));}
 createRoom(userId,input={}){
  this._user(userId);requireObject(input,['timeControl']);const seconds=timeControl(input.timeControl);this.rateLimit(`room:${userId}`,20,HOUR);this.tick();
  return this.db.transaction(()=>{this._requireFree(userId);const row=this._newMatch(userId,null,{timeControl:seconds,joinCode:randomBytes(5).toString('hex').toUpperCase()});this._occupy(userId,'match',row.id);return this._snapshot(row,userId);});
 }
 joinRoom(userId,input){
  this._user(userId);requireObject(input,['code']);const code=text(input.code,10,10,'Code du salon').toUpperCase();if(!/^[A-F0-9]{10}$/.test(code))fail(400,'INVALID_INPUT','Code du salon invalide.');
  this.rateLimit(`join:${userId}`,20,5*60000);this.tick();
  return this.db.transaction(()=>{
   const row=this.db.get('SELECT * FROM matches WHERE join_code=?',code);if(!row)fail(404,'ROOM_NOT_FOUND','Salon introuvable.');
   if(row.white_id===userId||row.black_id===userId)return this._snapshot(row,userId);
   this._requireFree(userId);if(row.status!=='waiting')fail(409,'ROOM_UNAVAILABLE','Ce salon est complet ou fermé.');
   row.black_id=userId;row.status='active';row.revision++;row.opening_deadline=this.now()+OPENING_TTL;row.waiting_expires=null;row.clock_at=this.now();this._writeMatch(row);
   this._occupy(userId,'match',row.id);this._event(row,'join',userId);return this._snapshot(row,userId);
  });
 }
 _queueState(userId){
  const entry=this.db.get('SELECT * FROM queue WHERE user_id=?',userId);
  if(entry)return {queued:true,match:null,pool:entry.pool,timeControl:entry.time_control,joinedAt:entry.joined_at};
  const active=this.db.get("SELECT * FROM matches WHERE status='active' AND (white_id=? OR black_id=?) ORDER BY created_at DESC LIMIT 1",userId,userId);
  return {queued:false,match:active?this._snapshot(active,userId):null};
 }
 _matchQueue(userId){
  const entry=this.db.get('SELECT * FROM queue WHERE user_id=?',userId);if(!entry)return this._queueState(userId);
  const rating=this._user(userId).rating;
  const candidates=this.db.all('SELECT queue.*,users.rating FROM queue JOIN users ON users.id=queue.user_id WHERE queue.user_id<>? AND pool=? AND time_control=? ORDER BY joined_at,user_id LIMIT 100',userId,entry.pool,entry.time_control);
  const opponent=candidates.find(other=>{
   const wait=Math.max(this.now()-entry.joined_at,this.now()-other.joined_at),range=Math.min(1200,200+Math.floor(wait/15000)*100);
   if(entry.pool==='ranked'&&Math.abs(other.rating-rating)>range)return false;
   if(entry.pool==='ranked'){
    const recent=this.db.get("SELECT COUNT(*) AS n FROM matches WHERE ranked=1 AND status='ended' AND created_at>=? AND ((white_id=? AND black_id=?) OR (white_id=? AND black_id=?))",this.now()-DAY,userId,other.user_id,other.user_id,userId).n;
    if(recent>=3)return false;
   }
   return true;
  });
  if(!opponent)return this._queueState(userId);
  const ids=randomInt(2)?[userId,opponent.user_id]:[opponent.user_id,userId];
  const row=this._newMatch(ids[0],ids[1],{ranked:entry.pool==='ranked',timeControl:entry.time_control});
  for(const id of ids){this.db.run('DELETE FROM queue WHERE user_id=?',id);this.db.run("UPDATE engagements SET kind='match',resource_id=? WHERE user_id=? AND kind='queue'",row.id,id);}
  return {queued:false,match:this._snapshot(row,userId)};
 }
 enqueue(userId,input={}){
  this._user(userId);requireObject(input,['pool','timeControl']);const pool=input.pool??'ranked',seconds=timeControl(input.timeControl);
  if(!['ranked','casual'].includes(pool))fail(400,'INVALID_INPUT','File de jeu invalide.');this.rateLimit(`queue:${userId}`,60,60000);this.tick();
  return this.db.transaction(()=>{
   const current=this.db.get('SELECT * FROM queue WHERE user_id=?',userId);
   if(current){if(current.pool!==pool||current.time_control!==seconds)fail(409,'QUEUE_CONFLICT','Quittez la file actuelle avant de changer de cadence.');this.db.run('UPDATE queue SET heartbeat_at=? WHERE user_id=?',this.now(),userId);return this._matchQueue(userId);}
   this._requireFree(userId);this._occupy(userId,'queue',userId);this.db.run('INSERT INTO queue(user_id,pool,time_control,joined_at,heartbeat_at) VALUES(?,?,?,?,?)',userId,pool,seconds,this.now(),this.now());return this._matchQueue(userId);
  });
 }
 queueStatus(userId){this._user(userId);this.tick();return this.db.transaction(()=>{this.db.run('UPDATE queue SET heartbeat_at=? WHERE user_id=?',this.now(),userId);return this._matchQueue(userId);});}
 leaveQueue(userId){this._user(userId);this.db.transaction(()=>{this.db.run('DELETE FROM queue WHERE user_id=?',userId);this.db.run("DELETE FROM engagements WHERE user_id=? AND kind='queue'",userId);});return {queued:false,match:null};}
 getMatch(userId,id){this._user(userId);return this.db.transaction(()=>{const row=this._match(id);this._member(row,userId);return this._snapshot(this._refreshRow(row),userId);});}
 command(userId,id,input){
  this._user(userId);requireObject(input,['commandId','expectedRevision','type','actionId']);
  const {commandId,expectedRevision,type,actionId}=input;
  if(typeof commandId!=='string'||!/^[a-zA-Z0-9_-]{12,128}$/.test(commandId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['roll','move','resign','cancel'].includes(type)||(type==='move'?(typeof actionId!=='string'||actionId.length>200):actionId!==undefined))fail(400,'INVALID_COMMAND','Commande invalide.');
  identifier(id);this.rateLimit(`command:${userId}`,300,60000);this.tick();
  return this.db.transaction(()=>{
   let row=this._match(id);const side=this._member(row,userId),fingerprint=digest(json({expectedRevision,type,actionId:actionId??null}));
   const previous=this.db.get('SELECT * FROM commands WHERE match_id=? AND command_id=?',row.id,commandId);
   if(previous){if(previous.actor_id!==userId)fail(403,'FORBIDDEN','Cette commande appartient à un autre joueur.');if(previous.fingerprint!==fingerprint)fail(409,'COMMAND_REUSED','Cette commande a déjà été utilisée avec un autre contenu.');return this._snapshot(this._refreshRow(row),userId);}
   if(row.revision!==expectedRevision)fail(409,'STALE_REVISION','La partie a changé. Rechargez sa position.');
   if(type==='cancel'){
    if(row.status!=='waiting'||side!=='w')fail(409,'CANNOT_CANCEL','Seul le créateur peut fermer un salon en attente.');
    row.status='cancelled';row.revision++;this._writeMatch(row);this._releaseMatch(row);this._event(row,'cancel',userId);
   }else{
    if(row.status!=='active')fail(409,'MATCH_NOT_ACTIVE','Cette partie n’est pas active.');
    const clock=this._clock(row),game=parsed(row.state_json);
    if(game.version!==VERSION)fail(409,'INCOMPATIBLE_RULES','Cette partie nécessite une version compatible du moteur.');
    if((game.phase==='opening'&&this.now()>=row.opening_deadline)||(row.running&&clock[row.running==='w'?'wMs':'bMs']<=0))fail(409,'CLOCK_EXPIRED','Le temps de jeu est écoulé. Rechargez la partie.');
    row.white_ms=clock.wMs;row.black_ms=clock.bMs;row.clock_at=this.now();row.revision++;
    if(type==='resign')this._finish(row,side==='w'?'b':'w','resign','resign',userId);
    else{
     const turn=game.phase==='opening'?'w':game.turn;if(side!==turn)fail(403,'NOT_YOUR_TURN','Ce n’est pas votre tour.');
     let next,details={};
     if(type==='roll'){
      if(!['opening','roll'].includes(game.phase))fail(409,'ILLEGAL_ACTION','Le lancer n’est pas disponible.');
      const values=this.dice();if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isInteger(v)||v<1||v>6))throw new Error('Invalid server dice source.');
      next=roll(game,values);details={dice:values};
     }else{
      if(game.phase!=='play'||!actions(game).some(action=>action.id===actionId))fail(409,'ILLEGAL_ACTION','Ce coup est interdit ou périmé.');
      next=play(game,actionId);details={actionId};
     }
     if(game.phase!=='opening'&&next.turn!==game.turn&&!next.winner){if(game.turn==='w')row.white_ms+=INCREMENT;else row.black_ms+=INCREMENT;}
     row.state_json=json(next);row.running=next.phase==='opening'?null:next.turn;
     if(next.winner)this._finish(row,next.winner,next.reason,type,userId,details);
     else{this._writeMatch(row);this._event(row,type,userId,details);}
    }
   }
   this.db.run('INSERT INTO commands(match_id,command_id,actor_id,fingerprint,revision) VALUES(?,?,?,?,?)',row.id,commandId,userId,fingerprint,row.revision);
   return this._snapshot(row,userId);
  });
 }
 getReplay(userId,id){
  const row=this.db.transaction(()=>{const match=this._match(id);this._member(match,userId);return this._refreshRow(match);});
  if(!['ended','cancelled'].includes(row.status))fail(409,'REPLAY_UNAVAILABLE','Le replay sera disponible après la partie.');
  if(parsed(row.state_json).version!==VERSION)fail(409,'INCOMPATIBLE_RULES','Ce replay nécessite une version compatible du moteur.');
  const events=this.db.all('SELECT event_json FROM match_events WHERE match_id=? ORDER BY sequence',row.id).map(row=>{const event=parsed(row.event_json);delete event.state;return event;});
  return {initialState:createGame(),events,match:this._snapshot(row,userId),rulesVersion:parsed(row.state_json).version};
 }
 leaderboard(){return this.db.all('SELECT * FROM users WHERE rated_games>0 ORDER BY rating DESC,rated_games DESC,username LIMIT 100').map(row=>this._profile(row));}
 _tournament(id){const row=this.db.get('SELECT * FROM tournaments WHERE id=?',identifier(id));if(!row)fail(404,'TOURNAMENT_NOT_FOUND','Tournoi introuvable.');return row;}
 _tournamentDTO(row,userId){
  const entrants=this.db.all('SELECT users.*,tournament_entrants.seed FROM tournament_entrants JOIN users ON users.id=tournament_entrants.user_id WHERE tournament_id=? ORDER BY tournament_entrants.seed,tournament_entrants.seed_rating DESC,users.id',row.id).map(user=>({...this._profile(user),seed:user.seed}));
  const profiles=new Map(entrants.map(user=>[user.id,user]));
  return {id:row.id,name:row.name,status:row.cancelled?'cancelled':row.status,ownerId:row.owner_id,maxPlayers:row.max_players,timeControl:row.time_control,entrants,matches:parsed(row.bracket_json).map(slot=>({...slot,a:profiles.get(slot.a)??null,b:profiles.get(slot.b)??null})),rounds:row.rounds,winnerId:row.winner_id,createdAt:row.created_at,joined:profiles.has(userId),tieBreakRule:'Après une première nulle, une revanche inverse les couleurs. Après une seconde nulle, la meilleure tête de série du tournoi avance. Les exemptions et départages ne modifient pas l’Elo.'};
 }
 listTournaments(userId){this._user(userId);this.tick();return this.db.all("SELECT * FROM tournaments ORDER BY CASE status WHEN 'registration' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,created_at DESC LIMIT 100").map(row=>this._tournamentDTO(row,userId));}
 createTournament(userId,input){
  this._user(userId);requireObject(input,['name','maxPlayers','timeControl']);const name=text(input.name,3,60,'Nom du tournoi'),maxPlayers=input.maxPlayers??8,seconds=timeControl(input.timeControl);
  if(!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>16)fail(400,'INVALID_INPUT','Un tournoi accueille de 2 à 16 joueurs.');this.rateLimit(`tournament:${userId}`,10,DAY);this.tick();
  return this.db.transaction(()=>{
   this._requireFree(userId);
   if(this.db.get("SELECT id FROM tournaments WHERE owner_id=? AND status IN ('registration','active')",userId))fail(409,'TOURNAMENT_EXISTS','Vous organisez déjà un tournoi ouvert.');
   const id=randomUUID(),now=this.now();this.db.run("INSERT INTO tournaments(id,owner_id,name,status,max_players,time_control,created_at,updated_at) VALUES(?,?,?,'registration',?,?,?,?)",id,userId,name,maxPlayers,seconds,now,now);
   this.db.run('INSERT INTO tournament_entrants(tournament_id,user_id,seed_rating,joined_at) VALUES(?,?,?,?)',id,userId,this._user(userId).rating,now);this._audit(userId,'tournament.created',id);
   return this._tournamentDTO(this._tournament(id),userId);
  });
 }
 joinTournament(userId,id){
  this._user(userId);this.rateLimit(`tournament-join:${userId}`,30,HOUR);this.tick();
  return this.db.transaction(()=>{
   const row=this._tournament(id);if(this.db.get('SELECT user_id FROM tournament_entrants WHERE tournament_id=? AND user_id=?',id,userId))return this._tournamentDTO(row,userId);
   if(row.status!=='registration')fail(409,'TOURNAMENT_CLOSED','Les inscriptions sont terminées.');this._requireFree(userId);
   if(this.db.get('SELECT COUNT(*) AS n FROM tournament_entrants WHERE tournament_id=?',id).n>=row.max_players)fail(409,'TOURNAMENT_FULL','Le tournoi est complet.');
   this.db.run('INSERT INTO tournament_entrants(tournament_id,user_id,seed_rating,joined_at) VALUES(?,?,?,?)',id,userId,this._user(userId).rating,this.now());this._audit(userId,'tournament.joined',id);return this._tournamentDTO(row,userId);
  });
 }
 leaveTournament(userId,id){
  this._user(userId);return this.db.transaction(()=>{
   const row=this._tournament(id);if(row.status!=='registration')fail(409,'TOURNAMENT_STARTED','Les départs sont possibles avant le début du tournoi.');
   if(row.owner_id===userId)fail(409,'OWNER_MUST_CANCEL','L’organisateur doit annuler le tournoi pour le quitter.');
   this.db.run('DELETE FROM tournament_entrants WHERE tournament_id=? AND user_id=?',id,userId);this._audit(userId,'tournament.left',id);return this._tournamentDTO(row,userId);
  });
 }
 cancelTournament(userId,id){
  this._user(userId);return this.db.transaction(()=>{
   const row=this._tournament(id);if(row.owner_id!==userId)fail(403,'FORBIDDEN','Seul l’organisateur peut annuler ce tournoi.');
   if(row.cancelled)return this._tournamentDTO(row,userId);
   if(row.status!=='registration')fail(409,'TOURNAMENT_STARTED','Un tournoi commencé ne peut plus être annulé.');
   this.db.run("UPDATE tournaments SET status='ended',cancelled=1,updated_at=? WHERE id=?",this.now(),id);this._audit(userId,'tournament.cancelled',id);return this._tournamentDTO(this._tournament(id),userId);
  });
 }
 _persistBracket(row,bracket){row.bracket_json=json(bracket);row.updated_at=this.now();this.db.run('UPDATE tournaments SET status=?,bracket_json=?,rounds=?,winner_id=?,updated_at=? WHERE id=?',row.status,row.bracket_json,row.rounds,row.winner_id,row.updated_at,row.id);}
 _fillBracket(row,bracket){
  for(const slot of bracket){
   if(slot.status!=='pending')continue;
   if(slot.round>1){
    const sources=bracket.filter(previous=>previous.round===slot.round-1&&(previous.position===slot.position*2||previous.position===slot.position*2+1)).sort((a,b)=>a.position-b.position);
    if(sources.length!==2||sources.some(previous=>previous.status!=='ended'))continue;
    slot.a=sources[0].winnerId;slot.b=sources[1].winnerId;
   }
   if(!slot.a||!slot.b){slot.winnerId=slot.a??slot.b;slot.bye=true;slot.status='ended';slot.decidedBy='bye';continue;}
   const match=this._newMatch(slot.a,slot.b,{timeControl:row.time_control,tournamentId:row.id,round:slot.round,slot:slot.position});
   slot.matchId=match.id;slot.gameIds.push(match.id);slot.status='active';
  }
  const final=bracket.find(slot=>slot.round===row.rounds);
  if(final?.status==='ended'){row.status='ended';row.winner_id=final.winnerId;this.db.run("DELETE FROM engagements WHERE kind='tournament' AND resource_id=?",row.id);this._audit(null,'tournament.ended',row.id,{winnerId:row.winner_id});}
  this._persistBracket(row,bracket);
 }
 startTournament(userId,id){
  this._user(userId);this.tick();return this.db.transaction(()=>{
   const row=this._tournament(id);if(row.owner_id!==userId)fail(403,'FORBIDDEN','Seul l’organisateur peut démarrer ce tournoi.');
   if(row.status!=='registration')return this._tournamentDTO(row,userId);
   const entrants=this.db.all('SELECT users.id,users.rating FROM tournament_entrants JOIN users ON users.id=tournament_entrants.user_id WHERE tournament_id=?',id).sort((a,b)=>b.rating-a.rating||a.id.localeCompare(b.id));
   if(entrants.length<2)fail(409,'NOT_ENOUGH_PLAYERS','Deux joueurs sont nécessaires pour démarrer.');
   for(const entrant of entrants)this._requireFree(entrant.id);
   entrants.forEach((entrant,index)=>{this.db.run('UPDATE tournament_entrants SET seed_rating=?,seed=? WHERE tournament_id=? AND user_id=?',entrant.rating,index+1,id,entrant.id);this._occupy(entrant.id,'tournament',id);});
   const initial=createSingleElimination(entrants);row.rounds=initial.rounds;row.status='active';
   const bracket=initial.matches.map((match,index)=>({id:match.id,round:1,position:index,a:match.a,b:match.b,winnerId:null,matchId:null,gameIds:[],bye:false,status:'pending',decidedBy:null}));
   for(let round=2;round<=row.rounds;round++)for(let position=0;position<2**(row.rounds-round);position++)bracket.push({id:`round-${round}-match-${position+1}`,round,position,a:null,b:null,winnerId:null,matchId:null,gameIds:[],bye:false,status:'pending',decidedBy:null});
   this._fillBracket(row,bracket);this._audit(userId,'tournament.started',id,{players:entrants.length});return this._tournamentDTO(row,userId);
  });
 }
 _advanceTournament(match){
  const row=this._tournament(match.tournament_id);if(row.status!=='active')return;
  const bracket=parsed(row.bracket_json),slot=bracket.find(item=>item.round===match.tournament_round&&item.position===match.tournament_slot);
  if(!slot||slot.status!=='active'||slot.matchId!==match.id)return;
  const result=parsed(match.result_json);
  if(result.winner==='draw'&&match.draw_index===0){
   const rematch=this._newMatch(match.black_id,match.white_id,{timeControl:row.time_control,tournamentId:row.id,round:slot.round,slot:slot.position,drawIndex:1});
   slot.matchId=rematch.id;slot.gameIds.push(rematch.id);slot.decidedBy='rematch';this._persistBracket(row,bracket);return;
  }
  if(result.winner==='draw'){
   const a=this.db.get('SELECT seed FROM tournament_entrants WHERE tournament_id=? AND user_id=?',row.id,slot.a),b=this.db.get('SELECT seed FROM tournament_entrants WHERE tournament_id=? AND user_id=?',row.id,slot.b);
   slot.winnerId=a.seed<b.seed?slot.a:slot.b;slot.decidedBy='seed-after-two-draws';
  }else{slot.winnerId=result.winner==='w'?match.white_id:match.black_id;slot.decidedBy=result.reason;}
  slot.status='ended';const loserId=slot.a===slot.winnerId?slot.b:slot.a;
  this.db.run("DELETE FROM engagements WHERE user_id=? AND kind='tournament' AND resource_id=?",loserId,row.id);
  this._audit(null,'tournament.advanced',row.id,{slotId:slot.id,matchId:match.id,winnerId:slot.winnerId,decidedBy:slot.decidedBy});this._fillBracket(row,bracket);
 }
 getTournament(userId,id){this._user(userId);this.tick();return this._tournamentDTO(this._tournament(id),userId);}
 _reportDTO(row){return {id:row.id,reporterId:row.reporter_id,matchId:row.match_id,category:row.category,details:row.details,status:row.status,note:row.note,createdAt:row.created_at,updatedAt:row.updated_at};}
 report(userId,input){
  this._user(userId);requireObject(input,['matchId','category','details']);const match=this._match(input.matchId);this._member(match,userId);
  if(!['cheating','abuse','other'].includes(input.category))fail(400,'INVALID_INPUT','Catégorie invalide.');const details=paragraph(input.details,5,2000,'Signalement');this.rateLimit(`report:${userId}`,10,DAY);
  return this.db.transaction(()=>{
   const existing=this.db.get('SELECT * FROM reports WHERE reporter_id=? AND match_id=? AND category=?',userId,match.id,input.category);if(existing)return {id:existing.id,status:existing.status};
   const id=randomUUID(),now=this.now();this.db.run('INSERT INTO reports(id,reporter_id,match_id,category,details,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,userId,match.id,input.category,details,now,now);this._audit(userId,'report.created',id,{matchId:match.id});return {id,status:'open'};
  });
 }
 _requireAdmin(userId){if(!this.adminUsernames.has(this._user(userId).username))fail(403,'FORBIDDEN','Accès réservé à la modération.');}
 listReports(adminId){this._requireAdmin(adminId);return this.db.all('SELECT * FROM reports ORDER BY updated_at DESC LIMIT 200').map(row=>this._reportDTO(row));}
 resolveReport(adminId,id,input){
  this._requireAdmin(adminId);requireObject(input,['status','note']);if(!['open','reviewing','resolved','dismissed'].includes(input.status))fail(400,'INVALID_INPUT','Statut de modération invalide.');const note=paragraph(input.note??'',['resolved','dismissed'].includes(input.status)?5:0,2000,'Note de modération');
  return this.db.transaction(()=>{const row=this.db.get('SELECT * FROM reports WHERE id=?',identifier(id));if(!row)fail(404,'REPORT_NOT_FOUND','Signalement introuvable.');this.db.run('UPDATE reports SET status=?,note=?,updated_at=? WHERE id=?',input.status,note,this.now(),id);this._audit(adminId,'report.reviewed',id,{from:row.status,to:input.status,note});return this._reportDTO(this.db.get('SELECT * FROM reports WHERE id=?',id));});
 }
}
