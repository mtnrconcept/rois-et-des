import {OnlineError} from './online-client.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class OnlineMatchController{
 constructor({client,onState,onError=()=>{},pollMs=1200}={}){this.client=client;this.onState=onState;this.onError=onError;this.pollMs=pollMs;this.match=null;this.stopped=true;this.pending=false;}
 async open(id){this.stopped=false;await this.refresh(id);this.loop();return this.match;}
 stop(){this.stopped=true;}
 async refresh(id=this.match?.id){if(!id||this.pending)return this.match;this.pending=true;try{const {match}=await this.client.match(id);this.match=match;this.onState?.(match);if(['ended','cancelled'].includes(match.status))this.stopped=true;return match;}finally{this.pending=false;}}
 async command(type,actionId){
  if(!this.match)throw new Error('No online match');
  const commandId=crypto.randomUUID().replaceAll('-','');
  try{const {match}=await this.client.command(this.match.id,{commandId,expectedRevision:this.match.revision,type,...(actionId?{actionId}:{})});this.match=match;this.onState?.(match);return match;}
  catch(error){if(error instanceof OnlineError&&['STALE_REVISION','CLOCK_EXPIRED'].includes(error.code))await this.refresh();throw error;}
 }
 async loop(){while(!this.stopped){await delay(this.pollMs);if(this.stopped)break;try{await this.refresh();}catch(error){this.onError(error);}}}
}
