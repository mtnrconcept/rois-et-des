import {createGame,roll,play} from './game.mjs';
async function sha256(value){const bytes=new TextEncoder().encode(JSON.stringify(value)),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function verifyReplay(replay){
 let state=createGame();const states=[state];
 if(state.version!==replay.rulesVersion)throw new Error('Version de règles incompatible.');
 for(const event of replay.events){
  if(event.type==='roll')state=roll(state,event.dice);
  else if(event.type==='move')state=play(state,event.actionId);
  else if(['join','cancel','resign','timeout'].includes(event.type)){}
  else throw new Error('Événement de replay inconnu.');
  if(await sha256(state)!==event.stateHash)throw new Error('Le replay ne correspond pas aux empreintes serveur.');
  states.push(state);
 }
 return states;
}
