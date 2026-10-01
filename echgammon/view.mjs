import {createEngineClient} from './engine-client.mjs';
import {createAnalysisPanel} from './analysis-ui.mjs';
import {analysisKey} from './analysis.mjs';
import {createWoodAudio,soundForAction} from './sound.mjs';
import {pieceSVG,cube} from './visuals.mjs';
import {createGame,roll,play,actions,isState,pieceName,sideName} from './game.mjs';
import {squareName,inCheck} from './chess.mjs';
import {choose,chooseBot} from './ai.mjs';
import {BOTS,EXERCISES,LESSONS,botById} from './catalog.mjs';
import {startTraining,attemptTraining,revealHint,showSolution,solutionAction,stars} from './training.mjs';
import {readProgress,writeProgress,recordExercise,recordGame} from './progress.mjs';
import {trainingCoach,actionExplanation,sourceTarget,bubble} from './coach.mjs';
const $=s=>document.querySelector(s), STORE='echgammon.royal.v3';
const aiEngine=createEngineClient(),hintEngine=createEngineClient(),wood=createWoodAudio();
let analysisPanel=null,hintSerial=0;
const params=new URLSearchParams(location.search);
const lesson=LESSONS.find(l=>l.id===params.get('lesson'))||null;
const exercise=EXERCISES.find(e=>e.id===(lesson?.exercise||params.get('puzzle')))||null;
const invalidTraining=(params.has('lesson')&&!lesson)||(params.has('puzzle')&&!exercise);
let training=exercise?startTraining(exercise.id):null,coach=null,introActive=Boolean(lesson),feedback='';
let game=createGame(),mode='ai',level='medium',bot=null,assisted=false,selected=null,selectedDice=[],available=[],timer=null,generation=0,promotions=[];
let sessionId=globalThis.crypto?.randomUUID?.()||('local-'+Date.now()+'-'+Math.random().toString(36).slice(2));
try {const saved=JSON.parse(localStorage.getItem(STORE));if(!training&&!invalidTraining&&!params.has('fresh')&&saved&&isState(saved.game)&&!(saved.game.phase==='play'&&!actions(saved.game).length)){
 game=saved.game;mode=saved.mode==='local'?'local':'ai';level=['easy','medium','hard'].includes(saved.level)?saved.level:'medium';bot=BOTS.find(b=>b.id===saved.bot)||null;assisted=Boolean(saved.assisted);sessionId=typeof saved.sessionId==='string'?saved.sessionId:sessionId;
}}catch{/* Storage is optional. */}
if(params.has('fresh')||(!training&&params.has('bot'))){
 if(params.has('fresh'))game=createGame();mode=params.get('mode')==='local'?'local':'ai';bot=mode==='ai'?botById(params.get('bot')):null;assisted=params.get('assist')==='1';
}
if(training){game=training.game;mode='local';assisted=false;}
if(params.has('fresh')){try{const url=new URL(location.href);url.searchParams.delete('fresh');history.replaceState(null,'',url);}catch{/* Offline test URL. */}}
$('#level').insertAdjacentHTML('beforeend','<optgroup label="Les bots du salon">'+BOTS.map(b=>`<option value="${b.id}">${b.name} · ${b.label}</option>`).join('')+'</optgroup>');
$('#mode').value=mode;$('#level').value=bot?.id||level;
const human=()=>!invalidTraining&&!introActive&&!training?.complete&&!game.winner&&(mode==='local'||game.turn==='w'||game.phase==='opening');
const selectedMask=()=>selectedDice.reduce((m,i)=>m|(1<<i),0);
const filtered=()=>available.filter(a=>!selectedDice.length||a.mask===selectedMask());
const matchesSource=a=>selected&&a.type===selected.type&&a.from===selected.from;
const payment=a=>a.rescue?'R':game.dice.flatMap((v,i)=>a.mask&(1<<i)?[v]:[]).join('+');
function renderChess() {
  const legal=filtered().filter(matchesSource),check=inCheck(game.chess,game.turn);
  let html='';
  for(let y=7;y>=0;y--)for(let x=0;x<8;x++) {
    const n=y*8+x,p=game.chess.board[n],targets=legal.filter(a=>a.type==='chess'&&a.to===n),on=selected?.type==='chess'&&selected.from===n,name=squareName(n);
    const classes=['square',(x+y)%2?'light':'dark',on?'selected':'',targets.length?'legal':'',targets.length&&p?'capture':'',check&&p===game.turn+'K'?'in-check':'',game.last?.type==='chess'&&game.last.to===n?'last-to':''].join(' ');
    html+=`<button id="sq-${name}" class="${classes}" data-square="${n}" aria-label="${name}${p?', '+pieceName[p[1]]+' '+sideName(p[0]):', vide'}" aria-pressed="${on}">${p?pieceSVG(p,n):''}<span class="coordinate">${name}</span>${targets.length?`<span class="cost-tag">${payment(targets[0])}</span>`:''}</button>`;
  }
  $('#chess-board').innerHTML=html;
}
function renderTrack(which) {
  const indices=which==='left'?[12,13,14,15,16,17,11,10,9,8,7,6]:[18,19,20,21,22,23,5,4,3,2,1,0];
  const legal=filtered().filter(matchesSource);
  $('#track-'+which).innerHTML=indices.map((n,index)=>{
    const count=game.race.points[n],color=count>0?'w':'b',num=Math.abs(count),targets=legal.filter(a=>a.type==='race'&&a.to===n),on=selected?.type==='race'&&selected.from===n;
    return `<button id="point-${n}" class="point ${index>=6?'up':'down'} ${on?'selected':''} ${targets.length?'legal':''}" data-point="${n}" aria-label="Pointe ${n+1}, ${num?num+' pions '+sideName(color):'vide'}" aria-pressed="${on}"><span class="triangle"></span><span class="point-number">${n+1}</span>${Array.from({length:Math.min(num,5)},(_,i)=>`<span class="checker ${color}" style="--i:${i}"></span>`).join('')}${num>5?`<span class="stack-count">×${num}</span>`:''}${targets.length?`<span class="cost-tag">${payment(targets[0])}</span>`:''}</button>`;
  }).join('');
}
function save() {
 if(training||invalidTraining)return;
 try{localStorage.setItem(STORE,JSON.stringify({game,mode,level,bot:bot?.id||null,assisted,sessionId}));}catch{/* Play remains available without storage. */}
 if(game.winner)try{writeProgress(recordGame(readProgress(),{id:sessionId,bot:mode==='local'?'local':bot?.id||'iris',winner:game.winner,humanSide:'w',reason:game.reason,turns:game.ply}));}catch{/* Stats must not block a game. */}
}
function render(animate=false) {
  const focused=document.activeElement?.id;available=actions(game);
  renderChess();renderTrack('left');renderTrack('right');
  for(const side of ['w','b']) {
    $('#player-'+side).classList.toggle('active',game.turn===side&&game.phase!=='opening');
    $('#score-'+side).textContent=game.race.off[side];$('#bar-count-'+side).textContent=game.race.bar[side];
    const bar=$('#bar-'+side);bar.innerHTML=`Barre ${side==='w'?'ivoire':'ébène'} <b>${game.race.bar[side]}</b>`;
    bar.disabled=!human()||game.phase!=='play'||game.turn!==side||game.race.bar[side]===0;
    bar.classList.toggle('selected',game.turn===side&&selected?.from==='bar');
    const off=$('#off-'+side);off.querySelector('b').textContent=`${game.race.off[side]} / 15`;
    off.querySelector('.off-coins').innerHTML=Array.from({length:15},(_,i)=>`<i class="${i<game.race.off[side]?'filled':''}"></i>`).join('');
    const canExit=filtered().some(a=>matchesSource(a)&&a.type==='race'&&a.to==='off')&&game.turn===side;
    off.disabled=!human()||!canExit;off.classList.toggle('legal',canExit);
  }
  $('#role-w').textContent=mode==='ai'?'VOUS':'JOUEUR 1';$('#role-b').textContent=mode==='ai'?(bot?bot.name.toUpperCase():'ORDINATEUR'):'JOUEUR 2';
  $('#level-label').hidden=mode!=='ai';document.body.classList.toggle('busy',!human()&&!game.winner);
  $('#status').textContent=game.notice;
  $('#turn-caption').textContent=game.winner?'FIN DE PARTIE':game.phase==='opening'?'LE PREMIER LANCER':`${sideName(game.turn).toUpperCase()} · TOUR ${game.ply+1}`;
  $('#instruction').textContent=game.winner?'Recommencez une partie pour une nouvelle stratégie.':!human()?'L’ordinateur prépare son prochain coup…':game.phase==='opening'?'Un dé pour chaque joueur. Le plus haut commence.':game.phase==='roll'?'Lancez les deux dés. Ils se partagent entre les deux jeux.':inCheck(game.chess,game.turn)?(available.some(a=>a.rescue)?'Parade royale : choisissez une défense. Elle consomme tous les dés.':'Votre roi est en échec : défendez-le avant toute autre action.'):'Sélectionnez une pièce ou un pion, puis une destination éclairée.';
  const rollButton=$('#roll');rollButton.disabled=!human()||!['opening','roll'].includes(game.phase);
  rollButton.textContent=game.phase==='opening'?'Lancer pour commencer':game.phase==='play'?'Jouez les dés':'Lancer les dés';
  $('#dice').innerHTML=(game.dice.length?game.dice:[3,5]).map((v,i)=>`<button class="die-button ${selectedDice.includes(i)?'selected':''} ${animate?'rolling':''}" data-die="${i}" ${!human()||game.phase!=='play'||game.used[i]?'disabled':''} aria-label="Dé ${i+1} : ${v}${game.used[i]?', utilisé':''}" aria-pressed="${selectedDice.includes(i)}">${cube(v)}</button>`).join('');
  const legal=filtered().filter(matchesSource),info=selected?`${selected.type==='chess'?pieceName[game.chess.board[selected.from]?.[1]]+' '+squareName(selected.from):selected.from==='bar'?'Pion sur la barre':'Pointe '+(selected.from+1)} · ${new Set(legal.map(a=>a.to)).size} destination(s) disponible(s).`:selectedDice.length?`Dés sélectionnés : ${selectedDice.map(i=>game.dice[i]).join(' + ')}. Choisissez une pièce ou un pion.`:'Un roi à mater. Quinze pions à faire sortir. À vous de choisir.';
  $('#selection-info').textContent=info;$('#clear-selection').disabled=!selected&&!selectedDice.length;$('#hint').disabled=!human()||game.phase!=='play';
  $('#turn-number').textContent='Tour '+Math.min(game.ply+1,400);
  $('#history').replaceChildren(...game.log.slice().reverse().map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if(focused&&document.getElementById(focused))document.getElementById(focused).focus({preventScroll:true});
  if(training){$('#roll').disabled=true;$('#roll').textContent='Dés de l’exercice';$('#turn-caption').textContent=lesson?'LEÇON GUIDÉE':'PROBLÈME TACTIQUE';$('#instruction').textContent=training.complete?'Objectif terminé. Consultez l’explication et continuez votre parcours.':introActive?'Suivez les bulles du guide, puis réalisez le mouvement.':exercise.objective;}
  $('#match-guidance').hidden=!assisted||Boolean(training)||invalidTraining;
  if(assisted&&!training){const a=filtered().find(matchesSource);$('#match-guidance-text').textContent=a?actionExplanation(game,a):game.phase==='opening'?'Le plus haut dé détermine le premier joueur. Vous aurez ensuite les deux valeurs pour votre premier tour.':game.phase==='roll'?'Lancez les dés, puis choisissez entre l’échiquier et la course.':inCheck(game.chess,game.turn)?'Le roi est prioritaire. Répondez à l’échec avant de jouer la course.':'Explorez les deux plateaux. Cliquez « Un conseil » pour comparer les variantes et comprendre le meilleur coup trouvé.';}
  coach?.update(feedback);
  save();
}
function cancelAI(){generation++;aiEngine.cancel();if(timer!==null){clearTimeout(timer);timer=null;}}
function cancelHint(hide=true){hintSerial++;hintEngine.cancel();if(hide)analysisPanel?.hide();}
function contact(a){const pan=a.type==='chess'?(a.to%8-3.5)/5:typeof a.to==='number'?(a.to<12?-.4:.4):0;wood.play(soundForAction(a),pan);}
function commitAction(id,report=null) {try{
 const accepted=available.find(a=>a.id===id);
 normalBubble.hide();coach?.close();
 if(training){const result=attemptTraining(training,id);training=result.session;game=training.game;feedback=result.message;selected=null;selectedDice=[];
  if(training.complete){const p=recordExercise(readProgress(),exercise.id,{stars:stars(training),kind:lesson?'lesson':'puzzle',lesson:lesson?.id||null});if(!writeProgress(p))feedback+=' Stockage indisponible : résultat conservé pour cette page seulement.';}
  if(result.correct&&accepted)contact(accepted);render();return;
 }
 const next=play(game,id);cancelHint();game=next;if(accepted)contact(accepted);selected=null;selectedDice=[];render();
 if(report)analysisPanel.show(report,{past:true,title:'Pourquoi l’ordinateur a joué ce coup'});scheduleAI();
}catch(e){$('#instruction').textContent=e.message;}}
function chooseDestination(candidates) {
  if(!candidates.length)return false;
  const different=[...new Map(candidates.map(a=>[a.promotion||'',a])).values()];
  if(different.length>1&&different[0].promotion) {
    promotions=different;$('#promotion-choices').innerHTML=different.map(a=>`<button data-promote="${a.promotion}">${pieceSVG(game.turn+a.promotion,'promotion-'+a.promotion)}${pieceName[a.promotion]}</button>`).join('');$('#promotion-dialog').showModal();
  }else commitAction(candidates[0].id);
  return true;
}
$('#chess-board').addEventListener('click',event=>{
  const cell=event.target.closest('[data-square]');if(!cell||!human()||game.phase!=='play')return;
  const n=+cell.dataset.square;
  if(chooseDestination(filtered().filter(a=>matchesSource(a)&&a.type==='chess'&&a.to===n)))return;
  if(game.chess.board[n]?.[0]===game.turn){selected=selected?.type==='chess'&&selected.from===n?null:{type:'chess',from:n};render();}
});
$('#chess-board').addEventListener('keydown',event=>{
  const cell=event.target.closest('[data-square]'),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:8,ArrowDown:-8}[event.key];
  if(cell&&delta){event.preventDefault();const n=+cell.dataset.square,next=n+delta;if(next>=0&&next<64&&(Math.abs(delta)===8||Math.floor(n/8)===Math.floor(next/8)))$('#sq-'+squareName(next)).focus();}
});
for(const which of ['left','right'])$('#track-'+which).addEventListener('click',event=>{
  const point=event.target.closest('[data-point]');if(!point||!human()||game.phase!=='play')return;
  const n=+point.dataset.point;
  if(chooseDestination(filtered().filter(a=>matchesSource(a)&&a.type==='race'&&a.to===n)))return;
  if(game.race.points[n]*(game.turn==='w'?1:-1)>0){selected=selected?.type==='race'&&selected.from===n?null:{type:'race',from:n};render();}
});
for(const side of ['w','b']) {
  $('#bar-'+side).addEventListener('click',()=>{if(human()&&game.turn===side&&game.phase==='play'){selected={type:'race',from:'bar'};render();}});
  $('#off-'+side).addEventListener('click',()=>{if(human()&&game.turn===side)chooseDestination(filtered().filter(a=>matchesSource(a)&&a.type==='race'&&a.to==='off'));});
}
$('#dice').addEventListener('click',event=>{
  const button=event.target.closest('[data-die]');if(!button||button.disabled||!human())return;
  const i=+button.dataset.die;
  if(selectedDice.includes(i))selectedDice=selectedDice.filter(n=>n!==i);else selectedDice=selectedDice.length>=2?[i]:[...selectedDice,i];
  render();
});
function throwDice(){return [1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)];}
$('#roll').addEventListener('click',()=>{if(!human()||!['opening','roll'].includes(game.phase))return;try{cancelHint();game=roll(game,throwDice());wood.play('dice');selected=null;selectedDice=[];render(true);scheduleAI();}catch(e){$('#instruction').textContent=e.message;}});
function scheduleAI() {
  cancelAI();if(training||invalidTraining||mode!=='ai'||game.turn!=='b'||game.phase==='opening'||game.winner)return;
  const token=generation,revision=game.revision;
  timer=setTimeout(async()=>{
    if(token!==generation||revision!==game.revision)return;
    timer=null;
    try {
      if(game.phase==='roll'){game=roll(game,throwDice());wood.play('dice');render(true);scheduleAI();}
      else if(bot?.rank>=5||(!bot&&level==='hard')){
        analysisPanel.busy((bot?.name||'Le maître')+' examine les variantes',true);
        const timeMs=bot?.id==='octave'?Math.min(1800,+$('#thinking-time').value):+$('#thinking-time').value;
        const result=await aiEngine.analyze(game,{timeMs,rootWidth:24,turnWidth:4,onProgress:p=>{if(token===generation)analysisPanel.progress(p);}});
        if(token!==generation||revision!==game.revision||document.hidden)return;
        if(result.actionId)commitAction(result.actionId,result);
      }else {const id=bot?chooseBot(game,bot.id):choose(game,level);if(id)commitAction(id);else $('#instruction').textContent='Aucun coup disponible. Vous pouvez reprendre en mode deux joueurs.';}
    }catch(e){if(e.name!=='AbortError')$('#instruction').textContent='Le coup n’a pas été exécuté : '+e.message;}
  },game.phase==='roll'?500:220);
}
async function requestAnalysis(timeMs=+$('#thinking-time').value){
 if(training||invalidTraining||!human()||game.phase!=='play')return;
 cancelHint();const serial=hintSerial,revision=game.revision;normalBubble.hide();analysisPanel.busy('Recherche du meilleur coup trouvé');
 try{
  const result=await hintEngine.analyze(game,{timeMs,rootWidth:24,turnWidth:4,onProgress:p=>{if(serial===hintSerial)analysisPanel.progress(p);}});
  if(serial!==hintSerial||revision!==game.revision||result.key!==analysisKey(game))return;
  analysisPanel.show(result);const a=available.find(a=>a.id===result.actionId);
  if(a){highlight(a);$('#selection-info').textContent='Suggestion analysée : '+result.candidates[0].label;}
 }catch(e){if(e.name!=='AbortError')$('#instruction').textContent='Analyse indisponible : '+e.message;}
}
$('#mode').addEventListener('change',event=>{cancelHint();cancelAI();mode=event.target.value==='local'?'local':'ai';selected=null;selectedDice=[];render();scheduleAI();});
$('#level').addEventListener('change',event=>{cancelHint();cancelAI();bot=BOTS.find(b=>b.id===event.target.value)||null;if(!bot)level=event.target.value;$('#match-context').textContent=bot?'CONTRE '+bot.name.toUpperCase():'PARTIE LIBRE';render();scheduleAI();});
$('#clear-selection').addEventListener('click',()=>{selected=null;selectedDice=[];render();});
$('#hint').addEventListener('click',()=>{if(training){$('#training-hint')?.click();return;}requestAnalysis();});
$('#rules-button').addEventListener('click',()=>$('#rules-dialog').showModal());$('#close-rules').addEventListener('click',()=>$('#rules-dialog').close());
$('#new-game').addEventListener('click',()=>$('#new-dialog').showModal());$('#cancel-new').addEventListener('click',()=>$('#new-dialog').close());
$('#confirm-new').addEventListener('click',()=>{cancelHint();cancelAI();wood.stop();normalBubble.hide();sessionId=globalThis.crypto?.randomUUID?.()||('local-'+Date.now());game=createGame();selected=null;selectedDice=[];promotions=[];$('#new-dialog').close();$('#promotion-dialog').close();render();});
$('#promotion-choices').addEventListener('click',event=>{const button=event.target.closest('[data-promote]');if(!button)return;const a=promotions.find(a=>a.promotion===button.dataset.promote);$('#promotion-dialog').close();if(a)commitAction(a.id);promotions=[];});
$('#view-button').addEventListener('click',event=>{const flat=document.body.classList.toggle('flat');event.target.textContent=flat?'Vue à plat':'Vue en relief';event.target.setAttribute('aria-pressed',String(!flat));});
function focusBoard(which,behavior='smooth') {
  const scroll=$('#board-scroll'),target=which==='chess'?$('.chess-frame'):$('#track-'+which),r=target.getBoundingClientRect(),s=scroll.getBoundingClientRect();
  scroll.scrollTo({left:scroll.scrollLeft+r.left-s.left-(scroll.clientWidth-r.width)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':behavior});
}
for(const button of document.querySelectorAll('[data-focus]'))button.addEventListener('click',()=>focusBoard(button.dataset.focus));
function highlight(a){selected={type:a.type,from:a.from};selectedDice=game.dice.flatMap((_,i)=>a.mask&(1<<i)?[i]:[]);render();}
function focusTarget(selector){
 const point=/^#point-(\d+)$/.exec(selector);if(point)focusBoard(+point[1]>=6&&+point[1]<=17?'left':'right','auto');
 else if(selector.startsWith('#sq-'))focusBoard('chess','auto');
 const el=document.querySelector(selector);el?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
}
const normalBubble=bubble();
$('#explain-move').addEventListener('click',()=>normalBubble.show({title:'Votre prochain choix',text:$('#match-guidance-text').textContent,anchor:selected?.type==='chess'?'#sq-'+squareName(selected.from):'#dice'}));
if(training){
 document.body.classList.add('training');$('#mode').disabled=true;$('#level').disabled=true;$('#new-game').hidden=true;
 $('#back-to-lobby').href='./index.html#'+(lesson?'learn':'puzzles');$('#match-context').textContent=lesson?'ACADÉMIE · '+lesson.title.toUpperCase():'PROBLÈME · '+exercise.title.toUpperCase();
 coach=trainingCoach({exercise,lesson,getSession:()=>training,onHint(){training=revealHint(training);},onReveal(){training=showSolution(training);const id=solutionAction(training);if(id)commitAction(id);},onRetry(){training=startTraining(exercise.id);game=training.game;selected=null;selectedDice=[];feedback='';render();},onPractice(){introActive=false;render();},onIntro(){introActive=true;render();},focus:focusTarget,onHighlight:highlight});
}else if(invalidTraining){
 $('#match-context').textContent='EXERCICE INTROUVABLE';$('#learning-panel').hidden=false;$('#learning-panel').innerHTML='<h2>Ce contenu n’existe pas.</h2><p>Retrouvez les exercices disponibles dans le salon.</p><a href="./index.html#puzzles">Retour aux problèmes →</a>';document.body.classList.add('training');
}else{$('#match-context').textContent=bot?'CONTRE '+bot.name.toUpperCase()+' · '+(assisted?'ACCOMPAGNÉ':'DÉFI'):mode==='local'?'DEUX JOUEURS · MÊME ÉCRAN':'PARTIE LIBRE';}
window.addEventListener('pagehide',()=>{cancelHint();cancelAI();wood.stop();normalBubble.hide();coach?.close();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelHint();cancelAI();wood.stop();}else scheduleAI();});
window.addEventListener('pageshow',()=>scheduleAI());
analysisPanel=createAnalysisPanel($('#analysis-panel'),{
 onChoose:(a,r)=>{if(human()&&r.key===analysisKey(game)){const found=available.find(m=>m.id===a.id);if(found){highlight(found);focusTarget(sourceTarget(found,game.turn));}}},
 onRequest:requestAnalysis,onCancel:()=>{
  const computerWasThinking=aiEngine.busy;cancelHint(false);
  if(computerWasThinking){cancelAI();if(!game.winner&&game.turn==='b'&&mode==='ai'&&game.phase==='play'){const id=bot?chooseBot(game,bot.id):choose(game,'hard');if(id)commitAction(id);}}
 }
});
function soundControls(){const s=wood.settings;$('#sound-toggle').setAttribute('aria-pressed',String(s.enabled));$('#sound-toggle').textContent=s.enabled?'Son du bois activé':'Son du bois coupé';$('#sound-volume').value=s.volume;$('#sound-value').textContent=Math.round(s.volume*100)+' %';}
function unlockAudio(){if(!wood.settings.enabled)return;wood.unlock().then(ok=>{$('#sound-status').textContent=ok?'':'Audio indisponible ou suspendu';});}
document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key))unlockAudio();},{capture:true});
$('#sound-toggle').addEventListener('click',()=>{wood.setEnabled(!wood.settings.enabled);soundControls();if(wood.settings.enabled)unlockAudio();});
$('#sound-volume').addEventListener('input',event=>{wood.setVolume(+event.target.value);soundControls();});
$('#thinking-time').addEventListener('change',()=>{cancelHint();cancelAI();scheduleAI();});
soundControls();
render();requestAnimationFrame(()=>{if(innerWidth<950)focusBoard('chess','auto');coach?.start();});scheduleAI();
