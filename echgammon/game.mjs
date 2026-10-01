import {createChess,legalChess,moveChess,inCheck,other,squareName} from './chess.mjs';
import {createRace,raceMoves,moveRace} from './race.mjs';
export const VERSION=3;
export const MAX_TURNS=400;
export const sideName=s=>s==='w'?'Ivoire':'Ébène';
export const pieceName={P:'Pion',N:'Cavalier',B:'Fou',R:'Tour',Q:'Dame',K:'Roi'};
export function createGame() {
  return {version:VERSION,chess:createChess(),race:createRace(),turn:'w',phase:'opening',dice:[],used:[],revision:0,ply:0,winner:null,reason:null,counts:{},log:[],notice:'Un dé par joueur. Le plus haut commence.',last:null};
}
const unused=g=>g.dice.reduce((mask,_,i)=>mask|(g.used[i]?0:1<<i),0);
const note=(g,text)=>{g.notice=text;g.log=[...g.log.slice(-79),text];};
function end(g,winner,reason) {g.winner=winner;g.reason=reason;g.phase='ended';note(g,winner==='draw'?`Partie nulle : ${reason==='limite'?'limite de 400 tours':'trois répétitions du plateau complet'}.`:`${sideName(winner)} gagne ${reason==='mat'?'par échec et mat':'avec 15 pions sortis'} !`);return g;}
function position(g) {return JSON.stringify([g.turn,g.chess.board,g.chess.rights,g.chess.ep,g.race]);}
function finish(g,message) {
  if(g.winner)return g;
  if(g.chess.ep&&g.chess.ep.side!==g.turn)g.chess.ep=null;
  g.used=g.dice.map(()=>true);g.turn=other(g.turn);g.phase='roll';g.ply++;
  if(g.ply>=MAX_TURNS)return end(g,'draw','limite');
  const key=position(g);g.counts[key]=(g.counts[key]||0)+1;
  if(g.counts[key]>=3)return end(g,'draw','répétition');
  note(g,message||`À ${sideName(g.turn)} de lancer les dés.`);return g;
}
export function actions(g) {
  if(g.winner||g.phase!=='play')return [];
  const mask=unused(g);if(!mask)return [];
  const payments=[];
  for(let i=0;i<g.dice.length;i++)if(mask&(1<<i)) {
    payments.push({mask:1<<i,cost:g.dice[i]});
    for(let j=i+1;j<g.dice.length;j++)if(mask&(1<<j))payments.push({mask:(1<<i)|(1<<j),cost:g.dice[i]+g.dice[j]});
  }
  const geometric=legalChess(g.chess,g.turn);
  const make=(m,pay,rescue=false)=>({...m,type:'chess',mask:pay,rescue,id:`${g.revision}:c:${m.from}:${m.to}:${m.promotion||''}:${pay}:${rescue?1:0}`});
  const chess=geometric.flatMap(m=>payments.filter(p=>p.cost===m.cost).map(p=>make(m,p.mask)));
  if(inCheck(g.chess,g.turn))return chess.length?chess:geometric.map(m=>make(m,mask,true));
  const race=[];
  for(let i=0;i<g.dice.length;i++)if(mask&(1<<i))for(const m of raceMoves(g.race,g.turn,g.dice[i]))race.push({...m,type:'race',mask:1<<i,id:`${g.revision}:r:${m.from}:${m.to}:${i}`});
  return [...chess,...race];
}
function normalize(g) {
  if(g.winner)return g;
  if(inCheck(g.chess,g.turn)&&!legalChess(g.chess,g.turn).length)return end(g,other(g.turn),'mat');
  if(!actions(g).length)return finish(g,unused(g)?`Aucun coup payable : tour passé. À ${sideName(other(g.turn))} de lancer.`:undefined);
  return g;
}
export function roll(state,values) {
  if(state.winner||!['opening','roll'].includes(state.phase))throw new Error('Lancer indisponible.');
  if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isInteger(v)||v<1||v>6))throw new Error('Deux dés de 1 à 6 sont requis.');
  const g=structuredClone(state);g.revision++;
  const [a,b]=values;
  if(g.phase==='opening') {
    g.dice=[a,b];g.used=[false,false];
    if(a===b){note(g,'Égalité au départ. Relancez les deux dés.');return g;}
    g.turn=a>b?'w':'b';g.counts={[position(g)]:1};note(g,`${sideName(g.turn)} commence avec ${a} et ${b}.`);
  } else {g.dice=a===b?[a,a,a,a]:[a,b];g.used=g.dice.map(()=>false);note(g,a===b?`Double ${a} : quatre valeurs à utiliser.`:`${sideName(g.turn)} : ${a} et ${b}. Choisissez votre stratégie.`);}
  g.phase='play';return normalize(g);
}
export function play(state,id) {
  const a=actions(state).find(a=>a.id===id);if(!a)throw new Error('Ce coup est interdit ou périmé.');
  const g=structuredClone(state),side=g.turn;g.revision++;
  g.used=g.used.map((used,i)=>used||Boolean(a.mask&(1<<i)));g.last={...a,side};
  if(a.type==='race') {
    g.race=moveRace(g.race,side,a);
    note(g,`${sideName(side)} : ${a.from==='bar'?'barre':a.from+1} → ${a.to==='off'?'sortie':a.to+1}${a.hit?' · pion frappé':''}.`);
    if(g.race.off[side]===15)return end(g,side,'course');
  } else {
    const name=pieceName[g.chess.board[a.from][1]];g.chess=moveChess(g.chess,a);
    note(g,`${sideName(side)} : ${name} ${squareName(a.from)} → ${squareName(a.to)}${a.promotion?' = '+pieceName[a.promotion]:''}${a.rescue?' · parade royale':''}.`);
    if(inCheck(g.chess,other(side))) {
      if(!legalChess(g.chess,other(side)).length)return end(g,side,'mat');
      return finish(g,`Échec ! ${sideName(other(side))} doit défendre son roi.`);
    }
  }
  return normalize(g);
}
/** Fail closed for corrupt/older local saves; no untrusted text is inserted as HTML. */
export function isState(g) {
  try {
    if(!g||g.version!==VERSION||!['w','b'].includes(g.turn)||!['opening','roll','play','ended'].includes(g.phase))return false;
    if(!Array.isArray(g.chess.board)||g.chess.board.length!==64||g.chess.board.some(p=>p!==null&&!/^[wb][PNBRQK]$/.test(p)))return false;
    for(const side of ['w','b'])if(g.chess.board.filter(p=>p===side+'K').length!==1)return false;
    for(const key of ['wK','wQ','bK','bQ'])if(typeof g.chess.rights[key]!=='boolean')return false;
    if(g.chess.ep!==null&&(!Number.isInteger(g.chess.ep?.target)||g.chess.ep.target<0||g.chess.ep.target>=64||!Number.isInteger(g.chess.ep.pawn)||g.chess.ep.pawn<0||g.chess.ep.pawn>=64||!['w','b'].includes(g.chess.ep.side)))return false;
    const r=g.race;if(!Array.isArray(r.points)||r.points.length!==24||r.points.some(n=>!Number.isInteger(n)||Math.abs(n)>15))return false;
    for(const s of ['w','b']) {if(!Number.isInteger(r.bar[s])||!Number.isInteger(r.off[s])||r.bar[s]<0||r.off[s]<0)return false;const sign=s==='w'?1:-1;if(r.points.reduce((n,v)=>n+Math.max(v*sign,0),0)+r.bar[s]+r.off[s]!==15)return false;}
    if(!Array.isArray(g.dice)||g.dice.length>4||g.dice.some(v=>!Number.isInteger(v)||v<1||v>6)||!Array.isArray(g.used)||g.used.length!==g.dice.length||g.used.some(v=>typeof v!=='boolean'))return false;
    if(!Number.isInteger(g.revision)||g.revision<0||!Number.isInteger(g.ply)||g.ply<0||g.ply>MAX_TURNS)return false;
    if(!g.winner&&(r.off.w===15||r.off.b===15))return false;
    if(![null,'w','b','draw'].includes(g.winner)||Boolean(g.winner)!==(g.phase==='ended'))return false;
    if(!g.counts||typeof g.counts!=='object'||Array.isArray(g.counts)||Object.keys(g.counts).length>MAX_TURNS+1||Object.values(g.counts).some(n=>!Number.isInteger(n)||n<1||n>3))return false;
    return Array.isArray(g.log)&&g.log.length<=80&&g.log.every(s=>typeof s==='string')&&typeof g.notice==='string';
  }catch{return false;}
}
