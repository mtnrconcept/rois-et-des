const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Display facts reported by the engine; no generated narrative or invented rating. */
export function createAnalysisPanel(root,{onChoose,onRequest,onCancel}){
 let result=null,historical=false;
 root.innerHTML=`<header class="analysis-heading"><div><p class="analysis-kicker">LE CABINET D’ANALYSE</p><h2 id="analysis-title">Comprendre avant de jouer.</h2></div><button id="analysis-close" aria-label="Fermer l’analyse">×</button></header><p id="analysis-stats" role="status" aria-live="polite"></p><div id="analysis-content"></div><footer class="analysis-footer"><span>Évaluation hybride · pas un classement Elo</span><button id="analysis-cancel" hidden>Arrêter le calcul</button><button id="analysis-deepen">Approfondir · 12 s max.</button></footer>`;
 root.querySelector('#analysis-close').onclick=()=>{onCancel();hide();};
 root.querySelector('#analysis-cancel').onclick=()=>{onCancel();root.querySelector('#analysis-stats').textContent='Calcul arrêté. Le plateau reste jouable.';root.querySelector('#analysis-cancel').hidden=true;root.querySelector('#analysis-deepen').disabled=false;root.querySelector('#analysis-content').textContent='Relancez une analyse quand vous le souhaitez.';};
 root.querySelector('#analysis-deepen').onclick=()=>onRequest(12000);
 root.addEventListener('click',e=>{const b=e.target.closest('[data-analysis-choice]');if(b&&!b.disabled&&!historical){const a=result?.candidates[+b.dataset.analysisChoice];if(a)onChoose(a,result);}});
 function hide(){root.hidden=true;result=null;}
 function busy(label='Votre position',computer=false){
  root.hidden=false;historical=false;result=null;root.dataset.transport='calculating';
  root.querySelector('#analysis-title').textContent=label;root.querySelector('#analysis-stats').textContent='Recherche des suites, réponses adverses et lancers possibles…';
  root.querySelector('#analysis-content').innerHTML='<div class="analysis-loading"><i></i><p>Les dés restent partagés. L’ordinateur examine aussi la course.</p></div>';
  root.querySelector('#analysis-cancel').textContent=computer?'Jouer sans attendre':'Arrêter le calcul';root.querySelector('#analysis-cancel').hidden=false;root.querySelector('#analysis-deepen').disabled=true;
 }
 function progress(p){if(root.hidden)return;root.querySelector('#analysis-stats').textContent=`${p.stats.nodes.toLocaleString('fr-CH')} positions parcourues · ${p.stats.stage} · ${(p.stats.elapsedMs/1000).toFixed(1)} s`;}
 function show(r,{past=false,title='Le meilleur coup trouvé'}={}){
  result=r;historical=past;root.hidden=false;root.dataset.transport=r.fallback?'fallback':'worker';
  root.querySelector('#analysis-title').textContent=title;
  const s=r.stats;
  root.querySelector('#analysis-stats').textContent=`${s.nodes.toLocaleString('fr-CH')} positions parcourues · ${s.evaluations.toLocaleString('fr-CH')} évaluations · ${(s.elapsedMs/1000).toFixed(2)} s · ${s.turns===2?'Tour analysé + réponse adverse':s.turns===1?'Suite du tour':'Évaluation initiale'}${r.fallback?' · secours rapide, Worker indisponible':''}${!s.complete?' · budget atteint, dernier calcul achevé conservé':''}`;
  const best=r.candidates[0];
  if(!best){root.querySelector('#analysis-content').textContent='Lancez les dés pour analyser une position jouable.';return;}
  const variations=r.candidates.map((c,i)=>`<button class="analysis-variation" data-analysis-choice="${i}" ${past?'disabled':''}><span>${i+1}</span><strong>${escape(c.label)}</strong><small>${c.immediateWin?'Victoire immédiate vérifiée':i===0?'Choix retenu':`${Math.round(best.score-c.score)} unités derrière le choix retenu`}</small></button>`).join('');
  root.querySelector('#analysis-content').innerHTML=`<div class="analysis-columns"><section><p class="analysis-best">${escape(best.label)}</p><h3>Pourquoi ce choix ?</h3><ul id="analysis-reasons">${best.reasons.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><h3>Suite examinée sur ces dés</h3><ol class="analysis-line">${best.line.map(x=>`<li>${escape(x.label)}</li>`).join('')}</ol>${best.risks.length?`<div class="analysis-risk"><h3>À surveiller</h3>${best.risks.map(x=>`<p>${escape(x)}</p>`).join('')}</div>`:''}</section><section><h3>${past?'Comparaison avant le coup':'Comparer et repérer sur le plateau'}</h3><div class="analysis-variations">${variations}</div>${best.reply?`<details class="analysis-reply"><summary>Une réponse adverse à surveiller</summary><p>Si l’adversaire obtient <b>${best.reply.dice.join(' et ')}</b> :</p><ol>${best.reply.line.map(x=>`<li>${escape(x)}</li>`).join('')}</ol><p>Exemple conditionnel parmi 21 lancers distincts, pondérés sur 36 possibilités. Ce lancer n’est pas prédit.</p></details>`:''}<p class="analysis-limits">${escape(r.limitation)}${past?' Analyse de la position avant le dernier coup de l’ordinateur.':''}</p></section></div>`;
  root.querySelector('#analysis-cancel').hidden=true;root.querySelector('#analysis-deepen').disabled=past;
 }
 return {busy,progress,show,hide};
}
