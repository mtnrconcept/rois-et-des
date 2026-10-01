/** Selective, time-bounded Échgammon analysis. Scores are hybrid units, not Elo.
 * Uses the authoritative rules, including shared dice, royal rescue and draws.
 * Unknown rolls are weighted chance nodes, never a copy of the current dice.
 */
import {actions,play,roll,pieceName} from './game.mjs';
import {moveChess,inCheck,legalChess,other,squareName} from './chess.mjs';
import {moveRace} from './race.mjs';

export const DICE_OUTCOMES=Object.freeze(Array.from({length:6},(_,a)=>
 Array.from({length:6-a},(_,i)=>Object.freeze({dice:Object.freeze([a+1,a+i+1]),weight:i===0?1:2}))).flat());
const VALUE={P:100,N:320,B:335,R:520,Q:960,K:0}, WIN=1000000;
const now=()=>globalThis.performance?.now?.()??Date.now();
const clamp=(n,min,max,fallback)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
const dirs={B:[[1,1],[-1,1],[1,-1],[-1,-1]],R:[[1,0],[-1,0],[0,1],[0,-1]],N:[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]};
dirs.Q=[...dirs.B,...dirs.R];dirs.K=dirs.Q;
const bits=n=>{let s=0;for(;n;n&=n-1)s++;return s;};
const boardKey=g=>JSON.stringify([g.chess.board,g.chess.rights,g.chess.ep,g.race,g.winner]);
export const analysisKey=g=>JSON.stringify([g.revision,g.turn,g.phase,g.dice,g.used,g.chess,g.race,g.ply,g.counts,g.winner]);
const semantic=(g,a)=>JSON.stringify([a.type,a.from,a.to,a.promotion||'',a.rescue,g.dice.filter((_,i)=>a.mask&(1<<i)).sort()]);

function attacks(board,side){
 const count=new Int16Array(64),least=new Int16Array(64).fill(30000);
 for(let from=0;from<64;from++){
  const p=board[from];if(p?.[0]!==side)continue;const type=p[1],x=from%8,y=from>>3;
  const steps=type==='P'?[[-1,side==='w'?1:-1],[1,side==='w'?1:-1]]:dirs[type];
  for(const [dx,dy] of steps)for(let d=1;d<8;d++){
   const xx=x+dx*d,yy=y+dy*d;if(xx<0||xx>7||yy<0||yy>7)break;
   const n=yy*8+xx;count[n]++;least[n]=Math.min(least[n],type==='K'?20000:VALUE[type]);
   if(board[n]||['P','K','N'].includes(type))break;
  }
 }
 return {count,least};
}
export function raceFeatures(r,side){
 const sign=side==='w'?1:-1,enemy=other(side);let pips=r.bar[side]*25,closed=0,home=0,blots=0,exposure=0,prime=0,run=0,remaining=0;
 for(let i=0;i<24;i++){
  const n=r.points[i]*sign,dist=side==='w'?i+1:24-i;
  if(n>=2){closed++;run++;prime=Math.max(prime,run);}else run=0;
  if(n<=0)continue;pips+=n*dist;remaining+=n;if(dist<=6)home+=n;
  if(n!==1)continue;blots++;let mask=0;
  for(let d=1;d<=6;d++){
   const from=i-sign*d;
   if(!r.bar[enemy]&&from>=0&&from<24&&r.points[from]*sign<0)mask|=1<<d;
   const entry=enemy==='w'?24-d:d-1;if(r.bar[enemy]&&entry===i)mask|=1<<d;
  }
  const k=bits(mask);exposure+=(1-((6-k)/6)**2)*(25-dist);
 }
 let entryBlocks=0;
 for(let i=0;i<6;i++)if(r.points[side==='w'?23-i:i]*sign<=-2)entryBlocks++;
 return {pips,closed,home,blots,exposure,prime,remaining,bar:r.bar[side],off:r.off[side],entryBlocks};
}
/** Geometric pressure is a heuristic, never a claim that an opponent can pay it. */
export function evaluate(g,perspective='w'){
 if(g.winner)return g.winner==='draw'?0:g.winner===perspective?WIN:-WIN;
 const board=g.chess.board,am={w:attacks(board,'w'),b:attacks(board,'b')},totals={w:0,b:0};
 for(const side of ['w','b']){
  const enemy=other(side),pawns=Array(8).fill(0);let bishops=0;
  for(let i=0;i<64;i++)if(board[i]===side+'P')pawns[i%8]++;
  for(let i=0;i<64;i++){
   const p=board[i];if(p?.[0]!==side)continue;const t=p[1],x=i%8,y=i>>3,advance=side==='w'?y:7-y,central=7-Math.abs(3.5-x)-Math.abs(3.5-y);
   totals[side]+=VALUE[t];if(t==='B')bishops++;
   if(t==='P'){
    totals[side]+=advance*8+central*3-(pawns[x]>1?10:0)-(!pawns[x-1]&&!pawns[x+1]?8:0);
    let passed=true;for(let j=0;j<64;j++)if(board[j]===enemy+'P'&&Math.abs(j%8-x)<=1&&(side==='w'?(j>>3)>y:(j>>3)<y))passed=false;
    if(passed)totals[side]+=advance*advance*4;
   }else if(t==='N'||t==='B')totals[side]+=central*6-(advance===0?12:0);
   else if(t==='R')totals[side]+=advance*2+(pawns[x]?0:12);
   if(t==='K'){
    if(am[enemy].count[i])totals[side]-=65;
    for(const [dx,dy] of dirs.K){const xx=x+dx,yy=y+dy;if(xx<0||xx>7||yy<0||yy>7)continue;
     const n=yy*8+xx;if(am[enemy].count[n])totals[side]-=12;if(board[n]===side+'P')totals[side]+=13;
    }
   }else if(am[enemy].count[i]){
    totals[side]-=am[side].count[i]?Math.max(0,VALUE[t]-am[enemy].least[i])*.24+9:VALUE[t]*.56;
   }
  }
  if(bishops>=2)totals[side]+=32;
  totals[side]+=am[side].count.reduce((n,v)=>n+(v?1:0),0)*1.2;
  const r=raceFeatures(g.race,side);
  totals[side]+=-r.pips*3.2+r.off*170+r.closed*13+r.home*6+r.prime*r.prime*8-r.exposure*3-r.bar*(55+r.entryBlocks*12);
  if(!r.bar&&r.home===r.remaining)totals[side]+=60+(r.off===14?750:0);
 }
 return totals[perspective]-totals[other(perspective)];
}
export function actionLabel(g,a){
 const pay=g.dice.filter((_,i)=>a.mask&(1<<i)).join('+');
 const move=a.type==='chess'?`${pieceName[g.chess.board[a.from]?.[1]]||'Pièce'} ${squareName(a.from)} → ${squareName(a.to)}${a.promotion?' = '+pieceName[a.promotion]:''}`:`${a.from==='bar'?'Barre':'Pointe '+(a.from+1)} → ${a.to==='off'?'sortie':a.to+1}`;
 return `${move} · ${a.rescue?'parade royale':pay}`;
}
export function explainAction(g,a){
 const reasons=[],risks=[],side=g.turn,enemy=other(side),payment=g.dice.filter((_,i)=>a.mask&(1<<i)).join(' + ');
 let c=g.chess,r=g.race;
 if(a.type==='chess'){
  c=moveChess(c,a);
  if(a.capture)reasons.push(`Capture le ${pieceName[a.capture[1]].toLowerCase()} adverse${a.epCapture!=null?' en passant':''}.`);
  if(a.rescue)reasons.push('Défend le roi avec une parade royale : tous les dés restants sont consommés.');
  else if(inCheck(g.chess,side))reasons.push('Répond à l’échec et remet le roi en sécurité.');
  if(a.promotion)reasons.push(`Promeut le pion en ${pieceName[a.promotion].toLowerCase()}.`);
  if(a.castle)reasons.push('Réalise le roque : le roi et la tour sont déplacés ensemble pour un coût de 2.');
  if(inCheck(c,enemy))reasons.push('Donne échec : le tour s’arrête et la défense royale devient prioritaire.');
  const own=attacks(c.board,side),opp=attacks(c.board,enemy);
  if(opp.count[a.to]&&c.board[a.to]?.[1]!=='K')risks.push(`La case ${squareName(a.to)} reste attaquée géométriquement ; une reprise dépend des dés et des défenses légales.`);
  if(!a.capture&&!a.promotion&&!a.castle&&!reasons.length){
   const t=g.chess.board[a.from][1],before=attacks(g.chess.board,enemy);
   if(before.count[a.from]&&!opp.count[a.to])reasons.push('Retire cette pièce d’une case attaquée vers une case non attaquée géométriquement.');
   else reasons.push(t==='P'?'Avance le pion et ouvre de nouvelles possibilités de développement.':'Améliore le placement et les possibilités de cette pièce.');
  }
  const threats=c.board.flatMap((p,i)=>p?.[0]===enemy&&p[1]!=='K'&&own.count[i]&&!opp.count[i]?[squareName(i)]:[]);
  if(threats.length)reasons.push(`Pièces adverses sans défense géométrique sous pression : ${threats.slice(0,3).join(', ')}.`);
 }else{
  r=moveRace(r,side,a);const sign=side==='w'?1:-1;
  if(a.to==='off')reasons.push(`Sort un pion avec la valeur exacte : ${r.off[side]} sur 15 sont désormais à l’abri.`);
  else if(a.from==='bar')reasons.push(`Rentre un pion de la barre ; il en reste ${r.bar[side]} à rentrer.`);
  else reasons.push(`Réduit de ${a.die} points la distance de course restante.`);
  if(a.hit)reasons.push('Frappe un pion isolé : l’adversaire devra le faire rentrer avant de reprendre sa course.');
  if(a.to!=='off'&&g.race.points[a.to]*sign===1)reasons.push('Forme une pointe protégée par deux pions.');
  if(typeof a.from==='number'&&g.race.points[a.from]*sign===2)risks.push(`Laisse un pion isolé sur la pointe ${a.from+1}.`);
  if(a.to!=='off'&&r.points[a.to]*sign===1)risks.push(`Le pion arrivé sur la pointe ${a.to+1} reste isolé.`);
 }
 if(!a.rescue)reasons.push(`Dépense ${payment}${bits(a.mask)>1?' en combinant deux dés':' sur un seul dé'} ; ${g.used.filter((u,i)=>!u&&!(a.mask&(1<<i))).length} valeur(s) restent disponibles avant une éventuelle fin de tour.`);
 return {label:actionLabel(g,a),payment,reasons,risks};
}
class Limit extends Error{}
/** Evaluate only fully completed comparison passes; never rank half-weighted rolls. */
export function analyze(state,options={}){
 const start=now(),timeMs=clamp(options.timeMs,0,15000,2500),maxNodes=Math.floor(clamp(options.maxNodes,1,100000,18000));
 const side=state.turn,stats={nodes:0,evaluations:0,cacheHits:0,elapsedMs:0,selective:true,complete:false,rootActions:0,rootCompared:0,rollsEvaluated:0,turns:0,stage:'position',budgetMs:timeMs};
 const memo=new Map(),transitions=new WeakMap(),lists=new WeakMap();
 const check=()=>{if(stats.nodes>=maxNodes||now()-start>=timeMs)throw new Limit();};
 const value=g=>{const key=boardKey(g);if(memo.has(key)){stats.cacheHits++;return memo.get(key);}const v=evaluate(g,side);stats.evaluations++;if(memo.size<30000)memo.set(key,v);return v;};
 const list=g=>{if(!lists.has(g)){const seen=new Set();lists.set(g,actions(g).filter(a=>{const key=semantic(g,a);if(seen.has(key))return false;seen.add(key);return true;}));}return lists.get(g);};
 const next=(g,a)=>{check();if(!transitions.has(g))transitions.set(g,new Map());const map=transitions.get(g);if(map.has(a.id)){stats.cacheHits++;return map.get(a.id);}stats.nodes++;const n=play(g,a.id);map.set(a.id,n);return n;};
 const ranked=g=>{
  const factor=g.turn===side?1:-1;
  return list(g).map(a=>{
   check();const n={...g,chess:a.type==='chess'?moveChess(g.chess,a):g.chess,race:a.type==='race'?moveRace(g.race,g.turn,a):g.race};
   let v=value(n)*factor;if(a.type==='chess'&&inCheck(n.chess,other(g.turn)))v+=legalChess(n.chess,other(g.turn)).length?75:WIN*2;if(n.race.off[g.turn]===15)v=WIN;
   return {a,v};
  }).sort((a,b)=>b.v-a.v||a.a.id.localeCompare(b.a.id));
 };
 // Complete a same-player turn with a beam; every transition still uses play().
 function turnPlans(g,width,initialLine=[]){
  const owner=g.turn,factor=owner===side?1:-1;let open=[{g,line:initialLine,score:value(g)}],done=[];
  for(let step=0;open.length&&step<5;step++){
   const children=[];
   for(const p of open){
    if(p.g.winner||p.g.phase!=='play'||p.g.turn!==owner){done.push(p);continue;}
    for(const {a} of ranked(p.g).slice(0,width)){
     const n=next(p.g,a),child={g:n,line:[...p.line,a],score:value(n)};
     if(n.winner||n.phase!=='play'||n.turn!==owner)done.push(child);else children.push(child);
    }
   }
   const seen=new Set();open=children.sort((a,b)=>(b.score-a.score)*factor).filter(p=>{
    const key=JSON.stringify([p.g.chess,p.g.race,p.g.dice,p.g.used]);if(seen.has(key))return false;seen.add(key);return true;
   }).slice(0,width);
  }
  if(!done.length)throw new Error('A turn failed to consume its dice.');
  return done.sort((a,b)=>(b.score-a.score)*factor).slice(0,width);
 }
 const initial=list(state);stats.rootActions=initial.length;
 let published=[],immediate=false;
 if(initial.length){
  const first=initial[0];published=[{a:first,g:state,line:[first],score:0,unsearched:true}];
  try{
   const roots=[];
   for(const a of initial){
    const g=next(state,a),entry={a,g,line:[a],score:value(g)};roots.push(entry);stats.rootCompared++;if(published[0]?.unsearched||entry.score>published[0].score)published=[entry];
    if(g.winner===side){published=[entry];stats.stage='victoire immédiate';stats.complete=true;immediate=true;break;}
   }
   if(!immediate){
    roots.sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id));published=roots;
    const pool=roots.slice(0,Math.floor(clamp(options.rootWidth,3,32,16))),turnWidth=Math.floor(clamp(options.turnWidth,1,8,3));
    const plans=[];
    for(const r of pool){
     if(r.g.winner||r.g.turn!==side||r.g.phase!=='play')plans.push(r);
     else {const p=turnPlans(r.g,turnWidth,r.line)[0];plans.push({...p,a:r.a});}
    }
    plans.sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id));published=plans;stats.turns=1;stats.stage='suite du tour';
    const finalists=plans.slice(0,Math.floor(clamp(options.candidateCount,2,8,5)));
    const passes=timeMs>=10000?[1,2,4,6,8]:timeMs>=4500?[1,2,4,6]:[1,2,3];
    for(const width of passes){
     const compared=[];
     for(const c of finalists){
      if(c.g.winner){compared.push(c);continue;}
      let expected=0,worst=null,lossWeight=0;
      for(const outcome of DICE_OUTCOMES){
       check();stats.nodes++;const rolled=roll(c.g,outcome.dice);stats.rollsEvaluated++;
       const response=rolled.winner||rolled.phase!=='play'?{g:rolled,line:[],score:value(rolled)}:turnPlans(rolled,Math.floor(clamp(options.replyWidth,1,8,width)))[0];
       expected+=response.score*outcome.weight/36;
       if(response.g.winner===other(side))lossWeight+=outcome.weight;
       if(!worst||response.score<worst.score)worst={...response,dice:[...outcome.dice]};
      }
      compared.push({...c,score:expected,worst,lossWeight,chanceComplete:true});
     }
     compared.sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id));published=compared;
     stats.turns=2;stats.stage=`réponses pondérées · faisceau ${width}`;stats.complete=true;
     options.onProgress?.({revision:state.revision,stats:{...stats,elapsedMs:now()-start},actionId:published[0]?.a.id});
    }
   }
  }catch(e){if(!(e instanceof Limit))throw e;stats.complete=false;}
 }
 const unique=[],seenMoves=new Set();
 for(const c of published){const k=semantic(state,c.a);if(seenMoves.has(k))continue;seenMoves.add(k);unique.push(c);if(unique.length===3)break;}
 const candidates=unique.map(c=>{
  const description=explainAction(state,c.a);let g=state;const captures=[];
  const line=c.line.map(a=>{const label=actionLabel(g,a);if(a.capture)captures.push(a.capture[1]);g=play(g,a.id);return {id:a.id,label,type:a.type,from:a.from,to:a.to};});
  if(line.length>1&&captures.length){const names=[...captures].sort((a,b)=>VALUE[b]-VALUE[a]).map(t=>pieceName[t].toLowerCase());description.reasons.unshift('La suite calculée capture '+names.join(' et ')+' avant le prochain lancer adverse.');}
  if(line.length>1&&inCheck(g.chess,other(side)))description.reasons.push('La suite dépense d’abord les autres valeurs avant de donner échec : elles ne sont pas perdues à la fin forcée du tour.');
  if(g.winner===side&&line.length>1)description.reasons.unshift('Cette suite légale sur les dés actuels atteint une victoire pendant ce même tour.');
  const immediateWin=!c.unsearched&&c.g.winner===side&&c.line.length===1;
  if(immediateWin)description.reasons.unshift(c.g.reason==='mat'?'Échec et mat vérifié : ce coup termine immédiatement la partie.':'Quinzième pion sorti : victoire immédiate vérifiée.');
  let reply=null;
  if(c.worst){let r=roll(c.g,c.worst.dice);const labels=c.worst.line.map(a=>{const text=actionLabel(r,a);r=play(r,a.id);return text;});reply={dice:c.worst.dice,line:labels};}
  if(c.lossWeight)description.risks.push(`Dans la recherche effectuée, ${c.lossWeight} lancers sur 36 permettent une victoire adverse immédiate pendant son prochain tour. Ce n’est pas une probabilité globale de défaite.`);
  return {id:c.a.id,score:Math.round(c.score),...description,line,reply,immediateWin,chanceComplete:Boolean(c.chanceComplete)};
 });
 stats.elapsedMs=Math.round(now()-start);
 return {revision:state.revision,key:analysisKey(state),actionId:candidates[0]?.id||null,candidates,stats,limitation:'Recherche sélective et bornée : meilleur coup trouvé, pas preuve d’optimalité. Les variantes après lancer sont conditionnelles.'};
}
