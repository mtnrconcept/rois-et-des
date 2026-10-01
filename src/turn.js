import{allActions}from'./engine.js';
export function getPlayableActionIndex(game,start=0){for(let i=start;i<game.actions.length;i++)if(allActions(game,game.turn,game.actions[i]).length)return i;return-1}
export function normalizeTurn(game,start=0){const n=structuredClone(game),index=getPlayableActionIndex(n,start);if(index>=0)return{game:n,index,passed:index-start};n.turn=n.turn==='white'?'black':'white';n.actions=[];return{game:n,index:0,passed:n.actions.length-start,ended:true}}
