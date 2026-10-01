export const W=6,H=8;
const setup=['rook','knight','bishop','king','queen','rook'];
export function createGame(){
 const pieces=[];
 setup.forEach((type,x)=>{pieces.push({id:'w'+x,color:'white',type,x,y:0,prison:false,off:false});pieces.push({id:'b'+x,color:'black',type,x:5-x,y:7,prison:false,off:false});});
 return {pieces,turn:'white',dice:[],actions:[],winner:null};
}
export const rollActions=([a,b])=>a===b?[a,a,a,a]:[a,b];
const at=(g,x,y)=>g.pieces.filter(p=>!p.prison&&!p.off&&p.x===x&&p.y===y);
const inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
function pathClear(g,p,x,y){
 const dx=Math.sign(x-p.x),dy=Math.sign(y-p.y); let cx=p.x+dx,cy=p.y+dy;
 while(cx!==x||cy!==y){if(at(g,cx,cy).length)return false;cx+=dx;cy+=dy} return true;
}
export function legalMoves(g,id,die){
 const p=g.pieces.find(q=>q.id===id); if(!p||p.prison||p.off)return[];
 if(g.pieces.some(q=>q.color===p.color&&q.prison))return[];
 const out=[]; for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  if(x===p.x&&y===p.y)continue; const dx=Math.abs(x-p.x),dy=Math.abs(y-p.y); let ok=false;
  if(p.type==='rook')ok=(dx===0||dy===0)&&dx+dy<=die&&pathClear(g,p,x,y);
  if(p.type==='bishop')ok=dx===dy&&dx<=die&&pathClear(g,p,x,y);
  if(p.type==='queen')ok=((dx===0||dy===0)||dx===dy)&&Math.max(dx,dy)<=die&&pathClear(g,p,x,y);
  if(p.type==='king')ok=Math.max(dx,dy)===1;
  if(p.type==='knight')ok=(dx===1&&dy===2)||(dx===2&&dy===1);
  if(!ok)continue; const occ=at(g,x,y), allies=occ.filter(q=>q.color===p.color), enemies=occ.filter(q=>q.color!==p.color);
  if(allies.length>=2||enemies.length>=2||allies.length&&enemies.length)continue;
  if(allies.length===1||enemies.length<=1)out.push({x,y,capture:enemies.length===1});
 } return out;
}
export function entryMoves(g,color,die){
 const y=color==='white'?0:7,x=color==='white'?die-1:6-die,occ=at(g,x,y);
 if(occ.length>=2)return[]; return [{x,y,capture:occ.length===1&&occ[0].color!==color}];
}
export function applyMove(g,id,to,die){
 const n=structuredClone(g),p=n.pieces.find(q=>q.id===id); if(!p)return n;
 if(p.prison){const legal=entryMoves(n,p.color,die);if(!legal.some(m=>m.x===to.x&&m.y===to.y))return n;}
 else if(!legalMoves(n,id,die).some(m=>m.x===to.x&&m.y===to.y))return n;
 const victims=at(n,to.x,to.y).filter(q=>q.color!==p.color); if(victims.length===1){victims[0].prison=true;victims[0].x=-1;victims[0].y=-1}
 p.x=to.x;p.y=to.y;p.prison=false;return n;
}
export function canBearOff(g,color){
 const own=g.pieces.filter(p=>p.color===color&&!p.off); if(own.some(p=>p.prison))return false;
 return own.every(p=>color==='white'?p.y>=6:p.y<=1);
}
export function bearOff(g,id,die){
 const n=structuredClone(g),p=n.pieces.find(q=>q.id===id); if(!p||!canBearOff(n,p.color))return n;
 const last=p.color==='white'?7:0,penult=p.color==='white'?6:1;if(p.y!==last&&!(p.y===penult&&die>=2))return n;
 p.off=true;p.x=-1;p.y=-1;if(n.pieces.filter(q=>q.color===p.color).every(q=>q.off))n.winner=p.color;return n;
}
export function allActions(g,color,die){
 const prisoners=g.pieces.filter(p=>p.color===color&&p.prison);
 if(prisoners.length)return prisoners.flatMap(p=>entryMoves(g,color,die).map(to=>({pieceId:p.id,to})));
 const moves=g.pieces.filter(p=>p.color===color&&!p.off).flatMap(p=>legalMoves(g,p.id,die).map(to=>({pieceId:p.id,to})));
 if(canBearOff(g,color))for(const p of g.pieces.filter(p=>p.color===color&&!p.off)){const last=color==='white'?7:0,pen=color==='white'?6:1;if(p.y===last||(p.y===pen&&die>=2))moves.push({pieceId:p.id,bearOff:true,to:{x:-1,y:-1}})}
 return moves;
}
