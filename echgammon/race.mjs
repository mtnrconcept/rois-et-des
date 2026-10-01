/** The two lateral panels form one 24-point race, with opposing directions. */
export function createRace() {
  const points=Array(24).fill(0);
  for(const [p,n] of [[23,2],[12,5],[7,3],[5,5],[0,-2],[11,-5],[16,-3],[18,-5]])points[p]=n;
  return {points,bar:{w:0,b:0},off:{w:0,b:0}};
}
export function raceMoves(r,side,die) {
  if(!Number.isInteger(die)||die<1||die>6)return [];
  const sign=side==='w'?1:-1, enemy=side==='w'?'b':'w';
  const open=to=>r.points[to]*sign>=-1;
  if(r.bar[side]>0){const to=side==='w'?24-die:die-1;return open(to)?[{from:'bar',to,die,hit:r.points[to]*sign===-1}]:[];}
  const own=r.points.flatMap((n,i)=>n*sign>0?[i]:[]);
  const home=own.length>0&&own.every(p=>side==='w'?p<6:p>=18);
  return own.flatMap(from=>{
    const to=from-sign*die;
    if(to>=0&&to<24)return open(to)?[{from,to,die,hit:r.points[to]*sign===-1}]:[];
    // The poster explicitly says exact dice: no oversized bear-off.
    return home&&to===(side==='w'?-1:24)?[{from,to:'off',die,hit:false}]:[];
  });
}
export function moveRace(r,side,m) {
  if(!raceMoves(r,side,m.die).some(a=>a.from===m.from&&a.to===m.to))throw new Error('Déplacement de course interdit.');
  const n={points:r.points.slice(),bar:{...r.bar},off:{...r.off}},sign=side==='w'?1:-1,enemy=side==='w'?'b':'w';
  if(m.from==='bar')n.bar[side]--;else n.points[m.from]-=sign;
  if(m.to==='off')n.off[side]++;
  else {if(n.points[m.to]*sign===-1){n.points[m.to]=0;n.bar[enemy]++;}n.points[m.to]+=sign;}
  return n;
}
