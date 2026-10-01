import {EXERCISES,exerciseState,square} from './catalog.mjs';
import {actions,play} from './game.mjs';
export function startTraining(id){return {id,game:exerciseState(id),step:0,hintLevel:0,hintsUsed:0,mistakes:0,revealed:false,complete:false};}
export function isExpected(session,a){
 const e=EXERCISES.find(e=>e.id===session.id),s=e?.steps[session.step];if(!s||session.complete||a.type!==s.type)return false;
 for(const k of ['from','to'])if(s[k]!==undefined){const want=s.type==='chess'?square(s[k]):s[k];if(a[k]!==want)return false;}
 if(s.promotion==='any'&&!a.promotion)return false;
 if(s.rescue&&!a.rescue)return false;if(s.castle&&a.castle!==s.castle)return false;
 return !s.mate||play(session.game,a.id).reason==='mat';
}
export function attemptTraining(session,id){
 if(session.complete)throw new Error('Exercice déjà terminé.');
 const a=actions(session.game).find(a=>a.id===id);if(!a)throw new Error('Coup interdit ou périmé.');
 if(!isExpected(session,a))return {correct:false,session:{...session,mistakes:session.mistakes+1},message:'Ce coup est légal, mais ne réalise pas l’objectif. La position est conservée : réessayez.'};
 const step=session.step+1,game=play(session.game,id),complete=step===EXERCISES.find(e=>e.id===session.id).steps.length;
 return {correct:true,session:{...session,game,step,complete,hintLevel:0},message:complete?'Objectif accompli.':'Bien joué. Poursuivez la séquence avec les dés restants.'};
}
export function revealHint(s){return {...s,hintLevel:Math.min(3,s.hintLevel+1),hintsUsed:Math.min(99,s.hintsUsed+1)};}
export function showSolution(s){return {...s,revealed:true,hintLevel:3};}
export function solutionAction(s){return actions(s.game).find(a=>isExpected(s,a))?.id||null;}
export function stars(s){return !s.complete||s.revealed?0:s.hintsUsed?1:s.mistakes?2:3;}
