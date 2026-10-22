const JSON_HEADERS={'Content-Type':'application/json'};
export class OnlineError extends Error{constructor(message,{status=0,code='NETWORK_ERROR'}={}){super(message);this.name='OnlineError';this.status=status;this.code=code;}}
export class OnlineClient{
 constructor({fetchImpl=globalThis.fetch}={}){this.fetch=fetchImpl;this.csrf=null;this.user=null;}
 async request(path,{method='GET',body,signal}={}){
  const headers={};if(body!==undefined)Object.assign(headers,JSON_HEADERS);if(this.csrf&&method!=='GET')headers['X-CSRF-Token']=this.csrf;
  let response;try{response=await this.fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',signal});}catch{throw new OnlineError('Le service en ligne est indisponible.',{code:'NETWORK_ERROR'});}
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new OnlineError(data?.error?.message||'La requête a échoué.',{status:response.status,code:data?.error?.code||'REQUEST_FAILED'});
  return data;
 }
 async session(){const data=await this.request('/api/session');this.user=data.user??null;this.csrf=data.csrf??null;return data;}
 async register(input){const data=await this.request('/api/auth/register',{method:'POST',body:input});this.user=data.user;this.csrf=data.csrf;return data;}
 async login(input){const data=await this.request('/api/auth/login',{method:'POST',body:input});this.user=data.user;this.csrf=data.csrf;return data;}
 async recover(input){const data=await this.request('/api/auth/recover',{method:'POST',body:input});this.user=data.user;this.csrf=data.csrf;return data;}
 async logout(){await this.request('/api/auth/logout',{method:'POST',body:{}});this.user=null;this.csrf=null;}
 profile(){return this.request('/api/profile');} updateProfile(input){return this.request('/api/profile',{method:'PATCH',body:input});}
 progress(){return this.request('/api/progress');} saveProgress(progress,expectedRevision){return this.request('/api/progress',{method:'PUT',body:{progress,expectedRevision}});}
 matches(){return this.request('/api/matches');} createRoom(timeControl=600){return this.request('/api/rooms',{method:'POST',body:{timeControl}});}
 joinRoom(code){return this.request('/api/rooms/join',{method:'POST',body:{code}});} enqueue(pool='ranked',timeControl=600){return this.request('/api/queue',{method:'POST',body:{pool,timeControl}});}
 queue(){return this.request('/api/queue');} leaveQueue(){return this.request('/api/queue',{method:'DELETE',body:{}});}
 match(id){return this.request(`/api/matches/${encodeURIComponent(id)}`);} command(id,body){return this.request(`/api/matches/${encodeURIComponent(id)}/commands`,{method:'POST',body});}
 replay(id){return this.request(`/api/matches/${encodeURIComponent(id)}/replay`);} leaderboard(){return this.request('/api/leaderboard');}
 tournaments(){return this.request('/api/tournaments');} createTournament(input){return this.request('/api/tournaments',{method:'POST',body:input});}
 tournament(id){return this.request(`/api/tournaments/${encodeURIComponent(id)}`);} tournamentAction(id,action){return this.request(`/api/tournaments/${encodeURIComponent(id)}/${action}`,{method:'POST',body:{}});}
 report(input){return this.request('/api/reports',{method:'POST',body:input});}
}
