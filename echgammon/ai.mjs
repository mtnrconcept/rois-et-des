import {botById} from './catalog.mjs';
import {actions,play} from './game.mjs';
import {moveChess,inCheck,legalChess,attacked,other} from './chess.mjs';
const value={P:100,N:310,B:325,R:500,Q:900,K:1500};
const bitCount=n=>n.toString(2).replaceAll('0','').length;
function score(g,a) {
  const side=g.turn,sign=side==='w'?1:-1;
  if(a.type==='race') {
    if(a.to==='off')return g.race.off[side]===14?1e7:330;
    let s=a.die*9+(a.hit?155:0)+(a.from==='bar'?100:0);
    const target=g.race.points[a.to]*sign;
    if(target===1)s+=60;if(target>3)s-=20;
    if(typeof a.from==='number'&&g.race.points[a.from]*sign===2)s-=30;
    if(side==='w'?a.to<6:a.to>=18)s+=24;
    return s;
  }
  const c=moveChess(g.chess,a),piece=g.chess.board[a.from][1];
  let s=(a.capture?value[a.capture[1]]:0)+(a.promotion?value[a.promotion]-100:0)+10;
  if(inCheck(c,other(side)))s+=legalChess(c,other(side)).length?70:1e7;
  if(attacked(c,a.to,other(side)))s-=value[piece]*0.55;
  s+=piece==='P'?Math.abs(a.to-a.from)/8*17:0;
  s+=a.castle?65:0;s-=bitCount(a.mask)*6;
  const x=a.to%8,y=Math.floor(a.to/8);s+=7-Math.abs(3.5-x)-Math.abs(3.5-y);
  return s;
}
/** Return the ID of an action from the same authoritative legal list as the UI. */
export function choose(g,level='medium',random=Math.random) {
  const available=actions(g);if(!available.length)return null;
  if(level==='easy')return available[Math.min(available.length-1,Math.floor(random()*available.length))].id;
  const ranked=available.map(a=>({a,s:score(g,a)})).sort((a,b)=>b.s-a.s);
  if(level==='hard')for(const entry of ranked.slice(0,8)) {
    const n=play(g,entry.a.id);
    if(n.winner===g.turn)entry.s+=1e7;
    else if(n.turn===g.turn&&n.phase==='play')entry.s+=Math.max(0,...actions(n).map(a=>score(n,a)))*0.35;
  }
  ranked.sort((a,b)=>b.s-a.s);return ranked[0].a.id;
}
/** Personality levels are indicative, not calibrated Elo ratings. Search is bounded for mobile. */
export function chooseBot(g,id,random=Math.random){
 const bot=botById(id),list=actions(g);if(!list.length)return null;
 const ranked=list.map(a=>({a,s:score(g,a)*(a.type==='race'?bot.race:bot.chess)})).sort((a,b)=>b.s-a.s);
 const win=ranked.find(r=>r.s>5e6);if(win)return win.a.id;
 const rand=()=>Math.max(0,Math.min(.999999,Number(random())||0));
 if(rand()<bot.error)return (bot.rank===1?list:ranked.slice(0,bot.top).map(r=>r.a))[Math.floor(rand()*(bot.rank===1?list.length:Math.min(bot.top,ranked.length)))].id;
 if(bot.search){
  const limit=bot.search===3?14:bot.search===2?9:5;
  for(const entry of ranked.slice(0,limit)){
   const n=play(g,entry.a.id);if(n.winner===g.turn){entry.s+=1e7;continue;}
   if(n.turn===g.turn&&n.phase==='play')entry.s+=Math.max(0,...actions(n).map(a=>score(n,a)))*.36;
   if(bot.search>=2){
    // A geometric threat estimate, not an exact prediction of the opponent's next dice.
    const replies=legalChess(n.chess,other(g.turn));let threat=0;
    for(const a of replies){let cost=a.capture?value[a.capture[1]]:0;
     if(bot.search===3&&a.capture){const c=moveChess(n.chess,a);if(attacked(c,a.to,g.turn))cost-=value[n.chess.board[a.from][1]]*.65;}
     threat=Math.max(threat,cost);
    }
    entry.s-=Math.max(0,threat)*(bot.search===3?.65:.35);
   }
  }
 }
 ranked.sort((a,b)=>b.s-a.s);return ranked[0].a.id;
}
