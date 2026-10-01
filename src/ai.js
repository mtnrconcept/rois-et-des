import {allActions,applyMove,bearOff} from './engine.js';
function score(g,a,color,die){
 if(a.bearOff)return 1000;
 const p=g.pieces.find(q=>q.id===a.pieceId), target=g.pieces.filter(q=>!q.prison&&!q.off&&q.x===a.to.x&&q.y===a.to.y);
 let s=target.some(q=>q.color!==color)?300:0;
 const progress=color==='white'?a.to.y:7-a.to.y;s+=progress*10;
 if(target.some(q=>q.color===color))s+=80;
 if(p?.type==='king')s-=10;
 return s;
}
export function chooseMove(g,die,level='medium'){
 const color=g.turn, actions=allActions(g,color,die); if(!actions.length)return null;
 if(level==='easy')return actions[Math.floor(Math.random()*actions.length)];
 const ranked=actions.map(a=>({a,s:score(g,a,color,die)}));
 if(level==='hard')for(const r of ranked){let n=r.a.bearOff?bearOff(g,r.a.pieceId,die):applyMove(g,r.a.pieceId,r.a.to,die);r.s+=allActions(n,color,die).reduce((m,a)=>Math.max(m,score(n,a,color,die)),0)*.25}
 ranked.sort((a,b)=>b.s-a.s);return ranked[0].a;
}
