/** Geometric chess rules. Turn ownership and dice belong to game.mjs. */
export const other = side => side === 'w' ? 'b' : 'w';
export const squareName = n => String.fromCharCode(97 + n % 8) + (1 + Math.floor(n / 8));
const xy = n => [n % 8, Math.floor(n / 8)];
const inside = (x,y) => x >= 0 && x < 8 && y >= 0 && y < 8;
const orthogonal = [[1,0],[-1,0],[0,1],[0,-1]];
const diagonal = [[1,1],[1,-1],[-1,1],[-1,-1]];
const knight = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
export function createChess() {
  const board = Array(64).fill(null), order = 'RNBQKBNR';
  for (let x=0;x<8;x++) { board[x]='w'+order[x];board[8+x]='wP';board[48+x]='bP';board[56+x]='b'+order[x]; }
  return {board,rights:{wK:true,wQ:true,bK:true,bQ:true},ep:null};
}
export function attacked(c, target, by) {
  const [tx,ty]=xy(target);
  for (let i=0;i<64;i++) {
    const p=c.board[i]; if(!p || p[0]!==by || i===target) continue;
    const [x,y]=xy(i), dx=tx-x, dy=ty-y, ax=Math.abs(dx), ay=Math.abs(dy), type=p[1];
    if(type==='P' && ax===1 && dy===(by==='w'?1:-1)) return true;
    if(type==='N' && ax*ay===2) return true;
    if(type==='K' && Math.max(ax,ay)===1) return true;
    if((type==='R'&&(dx===0||dy===0)) || (type==='B'&&ax===ay) || (type==='Q'&&(dx===0||dy===0||ax===ay))) {
      const sx=Math.sign(dx),sy=Math.sign(dy);let bx=x+sx,byy=y+sy,clear=true;
      while(bx!==tx||byy!==ty) { if(c.board[byy*8+bx]) {clear=false;break;}bx+=sx;byy+=sy; }
      if(clear) return true;
    }
  }
  return false;
}
export function inCheck(c, side) {
  const king=c.board.indexOf(side+'K'); return king<0 || attacked(c,king,other(side));
}
/** Apply an already-generated geometric move to a new chess position. */
export function moveChess(c,m) {
  const n={board:c.board.slice(),rights:{...c.rights},ep:null},p=n.board[m.from];
  if(!p) throw new Error('Pièce absente.');
  const corner={0:'wQ',7:'wK',56:'bQ',63:'bK'};
  if(p[1]==='K') {n.rights[p[0]+'K']=false;n.rights[p[0]+'Q']=false;}
  if(p[1]==='R'&&corner[m.from]) n.rights[corner[m.from]]=false;
  if(n.board[m.to]?.[1]==='R'&&corner[m.to]) n.rights[corner[m.to]]=false;
  n.board[m.from]=null;n.board[m.to]=m.promotion?p[0]+m.promotion:p;
  if(m.epCapture!=null) n.board[m.epCapture]=null;
  if(m.castle) {const base=p[0]==='w'?0:56,from=base+(m.castle==='K'?7:0),to=base+(m.castle==='K'?5:3);n.board[to]=n.board[from];n.board[from]=null;}
  if(p[1]==='P'&&Math.abs(m.to-m.from)===16) n.ep={target:(m.from+m.to)/2,pawn:m.to,side:p[0]};
  return n;
}
export function legalChess(c, side) {
  const moves=[];
  for(let from=0;from<64;from++) {
    const p=c.board[from];if(!p||p[0]!==side)continue;
    const type=p[1],[x,y]=xy(from);
    const add=(to,extra={})=>{
      const target=c.board[to];if(target?.[0]===side||target?.[1]==='K')return;
      const [tx,ty]=xy(to),cost=type==='N'?3:extra.castle?2:Math.max(Math.abs(tx-x),Math.abs(ty-y));
      const base={from,to,cost,capture:extra.epCapture!=null?other(side)+'P':target,...extra};
      if(type==='P'&&(ty===0||ty===7)) for(const promotion of ['Q','R','B','N']) moves.push({...base,promotion});
      else moves.push(base);
    };
    if(type==='P') {
      const step=side==='w'?1:-1,yy=y+step;
      if(inside(x,yy)&&!c.board[yy*8+x]) {add(yy*8+x);if(y===(side==='w'?1:6)&&!c.board[(y+2*step)*8+x])add((y+2*step)*8+x);}
      for(const xx of [x-1,x+1]) if(inside(xx,yy)) {
        const to=yy*8+xx;
        if(c.board[to]?.[0]===other(side))add(to);
        else if(c.ep?.side===other(side)&&c.ep.target===to&&c.board[c.ep.pawn]===other(side)+'P'&&!c.board[to])add(to,{epCapture:c.ep.pawn});
      }
    } else if(type==='N'||type==='K') {
      for(const [dx,dy] of type==='N'?knight:[...orthogonal,...diagonal])if(inside(x+dx,y+dy))add((y+dy)*8+x+dx);
      const base=side==='w'?0:56;
      if(type==='K'&&from===base+4&&!inCheck(c,side))for(const [castle,rook,empty,transit] of [['K',7,[5,6],[5,6]],['Q',0,[1,2,3],[3,2]]]) {
        if(c.rights[side+castle]&&c.board[base+rook]===side+'R'&&empty.every(q=>!c.board[base+q])&&transit.every(q=>!attacked(c,base+q,other(side))))add(base+(castle==='K'?6:2),{castle});
      }
    } else {
      const dirs=type==='B'?diagonal:type==='R'?orthogonal:[...orthogonal,...diagonal];
      for(const [dx,dy] of dirs)for(let xx=x+dx,yy=y+dy;inside(xx,yy);xx+=dx,yy+=dy) {const to=yy*8+xx;add(to);if(c.board[to])break;}
    }
  }
  return moves.filter(m=>!inCheck(moveChess(c,m),side));
}
