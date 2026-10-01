import {EXERCISES,LESSONS,BOTS} from './catalog.mjs';
export const PROGRESS_KEY='echgammon.academy.v1';
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
let memory;
function storageOrNull(){try{return globalThis.localStorage;}catch{return null;}}
export function createProgress(){return {version:1,exercises:{},lessons:{},games:[],activeDays:[]};}
function safe(p){
 if(!p||p.version!==1||!p.exercises||typeof p.exercises!=='object'||Array.isArray(p.exercises)||!p.lessons||typeof p.lessons!=='object'||Array.isArray(p.lessons)||!Array.isArray(p.games)||!Array.isArray(p.activeDays))return false;
 if(Object.keys(p.exercises).length>EXERCISES.length||Object.keys(p.lessons).length>LESSONS.length||p.games.length>50||p.activeDays.length>90)return false;
 for(const [id,r] of Object.entries(p.exercises))if(!EXERCISES.some(e=>e.id===id)||!r||!Number.isInteger(r.stars)||r.stars<0||r.stars>3||!validDay(r.date))return false;
 for(const [id,date] of Object.entries(p.lessons))if(!LESSONS.some(l=>l.id===id)||!validDay(date))return false;
 return new Set(p.games.map(g=>g?.id)).size===p.games.length&&p.activeDays.every(validDay)&&p.games.every(g=>g&&typeof g.id==='string'&&g.id.length<100&&['w','b','draw'].includes(g.winner)&&['w','b'].includes(g.humanSide)&&validDay(g.date)&&Number.isInteger(g.turns)&&g.turns>=0&&g.turns<=400&&[...BOTS.map(b=>b.id),'local'].includes(g.bot));
}
export function readProgress(storage=storageOrNull()){try{const raw=storage?.getItem(PROGRESS_KEY);if(raw){const p=JSON.parse(raw);return safe(p)?p:createProgress();}return memory?structuredClone(memory):createProgress();}catch{return memory?structuredClone(memory):createProgress();}}
export function writeProgress(p,storage=storageOrNull()){if(!safe(p))return false;memory=structuredClone(p);try{if(!storage)return false;storage.setItem(PROGRESS_KEY,JSON.stringify(p));return true;}catch{return false;}}
function active(p){p.activeDays=[...new Set([...p.activeDays,day()])].sort().slice(-90);return p;}
export function recordExercise(p,id,{stars,kind='puzzle',lesson=null}){
 if(!EXERCISES.some(e=>e.id===id)||!Number.isInteger(stars)||stars<0||stars>3)throw new Error('Résultat invalide.');
 const n=structuredClone(p);n.exercises[id]={stars:Math.max(stars,n.exercises[id]?.stars||0),date:day()};
 if(kind==='lesson'){if(!LESSONS.some(l=>l.id===lesson&&l.exercise===id))throw new Error('Leçon invalide.');if(stars>0)n.lessons[lesson]=day();}
 return active(n);
}
export function recordGame(p,result){
 if(!result||!['w','b','draw'].includes(result.winner)||typeof result.id!=='string'||result.id.length>=100||!['w','b'].includes(result.humanSide)||![...BOTS.map(b=>b.id),'local'].includes(result.bot)||!Number.isInteger(result.turns)||result.turns<0||result.turns>400)throw new Error('Partie incomplète.');
 if(p.games.some(g=>g.id===result.id))return p;
 const n=structuredClone(p);n.games=[{id:result.id,bot:result.bot,winner:result.winner,humanSide:result.humanSide,reason:result.reason==='mat'?'mat':result.reason==='course'?'course':'nulle',turns:result.turns,date:day()},...n.games].slice(0,50);return active(n);
}
export function summary(p){return {solved:Object.values(p.exercises).filter(r=>r.stars>0).length,reviewed:Object.keys(p.exercises).length,stars:Object.values(p.exercises).reduce((n,r)=>n+r.stars,0),lessons:Object.keys(p.lessons).length,games:p.games.length,wins:p.games.filter(g=>g.bot!=='local'&&g.winner===g.humanSide).length,days:p.activeDays.length};}
export function resetProgress(storage=storageOrNull()){const p=createProgress();memory=p;try{storage?.removeItem(PROGRESS_KEY);}catch{/* Optional storage. */}return p;}
