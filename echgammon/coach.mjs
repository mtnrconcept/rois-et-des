/** Contextual explanations anchored to actual controls; never an external AI claim. */
import {actions,pieceName} from './game.mjs';
import {squareName} from './chess.mjs';
import {EXERCISES,LESSONS} from './catalog.mjs';
import {solutionAction,stars} from './training.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function actionExplanation(g,a){
 const pay=g.dice.flatMap((v,i)=>a.mask&(1<<i)?[v]:[]).join(' + ');
 if(a.rescue)return 'Parade royale : ce mouvement protège votre roi. Il utilise tous les dés restants, même si leur valeur ne correspond pas à la distance.';
 if(a.type==='race')return `${a.from==='bar'?'Barre':'Pointe '+(a.from+1)} → ${a.to==='off'?'sortie':'pointe '+(a.to+1)} · dé ${pay}. `+(a.to==='off'?'La valeur correspond exactement à la sortie. Tous vos pions restants sont dans le dernier quadrant.':a.hit?'Le pion adverse isolé est frappé et rejoint la barre.':a.from==='bar'?'La rentrée libère ce pion. Les autres pions de course attendent tant qu’il en reste sur la barre.':'Un pion de course avance exactement de la valeur du dé, dans son sens de parcours.');
 const type=g.chess.board[a.from]?.[1],name=pieceName[type]||'Pièce';
 return `${name} ${squareName(a.from)} → ${squareName(a.to)} · paiement ${pay}. `+(a.castle?'Le roque met le roi à l’abri et déplace aussi la tour. Il coûte 2.':a.promotion?'Le pion est promu en '+pieceName[a.promotion].toLowerCase()+'.':type==='N'?'Le cavalier saute en L et coûte toujours 3.':`La distance exacte est ${a.cost}. ${a.capture?'La pièce adverse est capturée.':'Le trajet est légal et votre roi reste en sécurité.'}`);
}
export function sourceTarget(a,side='w'){return a.type==='chess'?'#sq-'+squareName(a.from):a.from==='bar'?'#bar-'+(side==='b'?'b':'w'):'#point-'+a.from;}
/** One reusable popover, keyboard dismissible and clamped to the viewport. */
export function bubble(name='normal'){
 const el=document.createElement('section');el.id='coach-bubble-'+name;el.className='coach-bubble';el.setAttribute('role','dialog');el.setAttribute('aria-label','Explication du guide');el.hidden=true;document.body.append(el);
 let target=null,closeAction=null;
 function position(){if(el.hidden||!target)return;const r=target.getBoundingClientRect(),width=Math.min(330,innerWidth-24);el.style.width=width+'px';const x=Math.max(12,Math.min(innerWidth-width-12,r.left+r.width/2-width/2));const h=el.offsetHeight;let y=r.bottom+12;if(y+h>innerHeight-12)y=r.top-h-12;el.style.left=x+'px';el.style.top=Math.max(12,Math.min(innerHeight-h-12,y))+'px';}
 function hide(){target?.classList.remove('coach-focus');el.hidden=true;target=null;}
 function show({title,text,anchor,label='Compris',onNext,onPrev,onClose,counter}){
  hide();target=document.querySelector(anchor)||document.querySelector('#dice');closeAction=onClose||hide;
  el.innerHTML=`<button class="bubble-close" aria-label="Fermer l’explication">×</button><p class="coach-kicker">LE GUIDE ${counter?'· '+counter:''}</p><h3>${escape(title)}</h3><p class="bubble-text">${escape(text)}</p><div class="bubble-controls">${onPrev?'<button id="coach-prev" class="coach-secondary">← Précédent</button>':''}<button id="coach-next" class="coach-primary">${escape(label)} →</button></div>`;
  el.querySelector('.bubble-close').onclick=()=>{hide();closeAction?.();};el.querySelector('#coach-next').onclick=()=>{hide();onNext?.();};if(onPrev)el.querySelector('#coach-prev').onclick=()=>{hide();onPrev();};
  target?.classList.add('coach-focus');el.hidden=false;position();requestAnimationFrame(position);
 }
 window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el.hidden){hide();closeAction?.();}});
 return {show,hide};
}
export function trainingCoach({exercise,lesson,getSession,onHint,onReveal,onRetry,onPractice,onIntro,focus,onHighlight}){
 const root=document.querySelector('#learning-panel'),pop=bubble('training');root.hidden=false;let cardIndex=0,intro=Boolean(lesson),feedback='';
 const render=()=>{
  const s=getSession(),ex=exercise,n=stars(s),nextLesson=lesson&&LESSONS[LESSONS.findIndex(l=>l.id===lesson.id)+1],nextExercise=EXERCISES[(EXERCISES.findIndex(e=>e.id===ex.id)+1)%EXERCISES.length];
  root.innerHTML=`<div class="coach-panel-top"><span class="coach-emblem">${lesson?'♧':'✦'}</span><div><p class="coach-kicker">${lesson?'ACADÉMIE · LEÇON '+lesson.number:'ATELIER TACTIQUE'}</p><h2 id="training-title">${escape(lesson?.title||ex.title)}</h2></div></div><div class="training-meter"><span style="width:${s.step/ex.steps.length*100}%"></span></div><p class="training-counter">${s.complete?'TERMINÉ':intro?'DÉCOUVERTE GUIDÉE':'À VOUS DE JOUER'} · ${s.step} / ${ex.steps.length} action${ex.steps.length>1?'s':''}</p>
  ${s.complete?`<div id="training-success" class="training-success"><div class="earned-stars" aria-label="${n} étoiles">${n?'★'.repeat(n)+'☆'.repeat(3-n):'✧'}</div><h3>${s.revealed?'Solution étudiée.':'Bien joué !'}</h3><p>${s.revealed?'Vous avez consulté la solution. Rejouez sans aide pour gagner des étoiles.':'Vous avez atteint l’objectif de cet exercice.'}</p></div><p class="training-explanation">${escape(ex.explanation)}</p><a class="coach-primary next-training" href="./play.html?${nextLesson?'lesson='+nextLesson.id:lesson?'lesson='+LESSONS[0].id:'puzzle='+nextExercise.id}">${lesson&&!nextLesson?'Revoir le parcours':lesson?'Leçon suivante':'Problème suivant'} →</a>`:`<p class="training-objective">${escape(ex.objective)}</p><p class="training-note">${ex.steps.length>1?'Respectez la séquence. Les dés non dépensés restent disponibles.':'Cliquez une pièce ou un pion, puis sa destination.'}</p><div id="training-feedback" class="training-feedback" role="status" aria-live="polite">${escape(feedback)}</div>${s.hintLevel?`<div class="hint-explanation"><span>INDICE ${s.hintLevel} / 3</span><p>${escape(s.hintLevel===3?hintLast(s):ex.hints[s.hintLevel-1])}</p></div>`:''}<div class="training-actions"><button id="training-hint" class="coach-primary" ${intro?'disabled':''}>✧ ${s.hintLevel>=3?'Revoir le dernier indice':'Un indice'}${s.hintLevel<3?' · '+(s.hintLevel+1)+'/3':''}</button><button id="training-solution" class="coach-secondary" ${intro?'disabled':''}>${s.revealed?'Jouer la suite de la solution':'Voir la solution'}</button></div>`}
  <div class="training-bottom"><button id="retry-exercise" class="coach-secondary">↻ Recommencer</button>${lesson?'<button id="restart-guide" class="coach-secondary">Revoir les bulles</button>':''}</div><div class="coach-rules-note"><strong>À votre rythme.</strong><p>${lesson?'La leçon est validée après la mise en pratique.':'3 étoiles sans aide ni erreur · 2 après une erreur · 1 avec indices · 0 si solution consultée.'}</p><a href="./index.html#${lesson?'learn':'puzzles'}">← Retour ${lesson?'aux leçons':'aux problèmes'}</a></div>`;
  root.querySelector('#training-hint')?.addEventListener('click',()=>{onHint();const state=getSession();render();if(state.hintLevel===3){const a=actions(state.game).find(a=>a.id===solutionAction(state));if(a){onHighlight(a);focus(sourceTarget(a));pop.show({title:'Regardez ici',text:actionExplanation(state.game,a),anchor:sourceTarget(a),onNext:()=>{}});}}});
  root.querySelector('#training-solution')?.addEventListener('click',()=>{pop.hide();onReveal();render();});
  root.querySelector('#retry-exercise').onclick=()=>{pop.hide();feedback='';intro=false;onPractice();onRetry();render();};
  root.querySelector('#restart-guide')?.addEventListener('click',()=>{cardIndex=0;intro=true;showCard();});
 };
 function hintLast(s){const a=actions(s.game).find(a=>a.id===solutionAction(s));return a?actionExplanation(s.game,a):exercise.hints[2];}
 function practice(){intro=false;pop.hide();onPractice();render();}
 function showCard(){if(!lesson)return;onIntro();const c=lesson.cards[cardIndex];focus(c.target);render();pop.show({title:c.title,text:c.text,anchor:c.target,counter:`${cardIndex+1} / ${lesson.cards.length}`,label:cardIndex===lesson.cards.length-1?'À moi de jouer':'Suivant',onNext:()=>{if(++cardIndex===lesson.cards.length)practice();else showCard();},onPrev:cardIndex>0?()=>{cardIndex--;showCard();}:null,onClose:practice});}
 return {update(message){if(message!==undefined)feedback=message;render();},start(){render();if(lesson)requestAnimationFrame(showCard);},close(){pop.hide();},isIntro:()=>intro};
}
