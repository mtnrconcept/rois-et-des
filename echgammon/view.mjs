import {createGame,roll,play,actions,isState,pieceName,sideName} from './game.mjs';
import {squareName,inCheck} from './chess.mjs';
import {choose} from './ai.mjs';
const $=s=>document.querySelector(s), STORE='echgammon.royal.v3';
let game=createGame(),mode='ai',level='medium',selected=null,selectedDice=[],available=[],timer=null,generation=0,promotions=[];
try {const saved=JSON.parse(localStorage.getItem(STORE));if(saved&&isState(saved.game)&&!(saved.game.phase==='play'&&!actions(saved.game).length)){game=saved.game;mode=saved.mode==='local'?'local':'ai';level=['easy','medium','hard'].includes(saved.level)?saved.level:'medium';}}catch{/* Storage is optional. */}
$('#mode').value=mode;$('#level').value=level;
const human=()=>!game.winner&&(mode==='local'||game.turn==='w'||game.phase==='opening');
const selectedMask=()=>selectedDice.reduce((m,i)=>m|(1<<i),0);
const filtered=()=>available.filter(a=>!selectedDice.length||a.mask===selectedMask());
const matchesSource=a=>selected&&a.type===selected.type&&a.from===selected.from;
const payment=a=>a.rescue?'R':game.dice.flatMap((v,i)=>a.mask&(1<<i)?[v]:[]).join('+');
const paths={
 P:'M31 49 Q29 60 25 73 L55 73 Q51 60 49 49Z M28 45 Q40 38 52 45 L49 51H31Z M51 26A11 11 0 1 1 29 26A11 11 0 1 1 51 26Z',
 R:'M27 34H53L50 48L53 73H27L30 48Z M22 17H30V25H35V17H45V25H50V17H58L55 38H25Z',
 B:'M31 47H49L52 73H28Z M24 43Q23 30 40 12Q57 30 56 43Q40 55 24 43Z M28 53H52L51 57H29Z',
 N:'M25 72Q27 62 29 56L22 50L25 42L35 30L36 16L43 21L49 17L52 31Q63 42 58 62L57 73Z M29 45L39 42L43 34',
 Q:'M29 47H51L53 73H27Z M21 25L31 34L34 18L40 33L47 18L49 34L59 25L53 49H27Z M25 51H55L52 56H28Z',
 K:'M29 48H51L52 73H28Z M24 34Q40 27 56 34L51 50H29Z M36 10H44V18H52V26H44V34H36V26H28V18H36Z'
};
function pieceSVG(p,id) {
  const light=p[0]==='w',grad='piece-'+id,colors=light?['#785224','#d7b477','#fff0c7','#af8750']:['#080706','#30271e','#74634d','#100c09'];
  const detail=p[1]==='B'?'<path d="M43 22L34 38" stroke="#49301f" stroke-width="2"/>':p[1]==='N'?'<circle cx="43" cy="33" r="2" fill="#100d09"/>':p[1]==='Q'?'<g fill="url(#'+grad+')"><circle cx="21" cy="24" r="3"/><circle cx="34" cy="17" r="3"/><circle cx="47" cy="17" r="3"/><circle cx="59" cy="24" r="3"/></g>':'';
  return `<svg class="chess-piece" viewBox="0 0 80 100" aria-hidden="true"><defs><linearGradient id="${grad}"><stop offset="0" stop-color="${colors[0]}"/><stop offset=".28" stop-color="${colors[1]}"/><stop offset=".53" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[3]}"/></linearGradient></defs><ellipse cx="41" cy="94" rx="28" ry="5" fill="#0004"/><g fill="url(#${grad})" stroke="${light?'#70532d':'#080705'}" stroke-width="1.1" stroke-linejoin="round"><path d="M23 72Q40 67 57 72L60 79L56 84H24L20 79Z"/><path d="${paths[p[1]]}"/><path d="M21 79H59L65 88Q64 96 40 96Q16 96 15 88Z"/><ellipse cx="40" cy="81" rx="21" ry="4"/><path d="M18 88Q39 94 62 88" fill="none" stroke="${light?'#f7dfad':'#998466'}" opacity=".6"/></g>${detail}</svg>`;
}
function cube(value) {
  const top=[1,6].includes(value)?2:1,right=[1,2,3,4,5,6].find(n=>![value,7-value,top,7-top].includes(n));
  const dots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  return '<span class="cube">'+Object.entries({front:value,back:7-value,top,bottom:7-top,right,left:7-right}).map(([face,v])=>`<span class="face ${face}">${dots[v].map(n=>`<i class="pip" style="grid-area:${Math.floor(n/3)+1}/${n%3+1}"></i>`).join('')}</span>`).join('')+'</span>';
}
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
function save() {try{localStorage.setItem(STORE,JSON.stringify({game,mode,level}));}catch{/* Play remains available without storage. */}}
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
  $('#role-w').textContent=mode==='ai'?'VOUS':'JOUEUR 1';$('#role-b').textContent=mode==='ai'?'ORDINATEUR':'JOUEUR 2';
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
  save();
}
function cancelAI(){generation++;if(timer!==null){clearTimeout(timer);timer=null;}}
function commitAction(id) {try{game=play(game,id);selected=null;selectedDice=[];render();scheduleAI();}catch(e){$('#instruction').textContent=e.message;}}
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
$('#roll').addEventListener('click',()=>{if(!human()||!['opening','roll'].includes(game.phase))return;try{game=roll(game,throwDice());selected=null;selectedDice=[];render(true);scheduleAI();}catch(e){$('#instruction').textContent=e.message;}});
function scheduleAI() {
  cancelAI();if(mode!=='ai'||game.turn!=='b'||game.phase==='opening'||game.winner)return;
  const token=generation,revision=game.revision;
  timer=setTimeout(()=>{
    if(token!==generation||revision!==game.revision)return;
    timer=null;
    try {
      if(game.phase==='roll'){game=roll(game,throwDice());render(true);scheduleAI();}
      else {const id=choose(game,level);if(id)commitAction(id);else $('#instruction').textContent='Aucun coup disponible. Vous pouvez reprendre en mode deux joueurs.';}
    }catch(e){$('#instruction').textContent='Le coup n’a pas été exécuté : '+e.message;}
  },game.phase==='roll'?600:380);
}
$('#mode').addEventListener('change',event=>{cancelAI();mode=event.target.value==='local'?'local':'ai';selected=null;selectedDice=[];render();scheduleAI();});
$('#level').addEventListener('change',event=>{level=event.target.value;save();});
$('#clear-selection').addEventListener('click',()=>{selected=null;selectedDice=[];render();});
$('#hint').addEventListener('click',()=>{if(!human()||game.phase!=='play')return;const id=choose(game,'hard'),a=available.find(a=>a.id===id);if(a){selected={type:a.type,from:a.from};selectedDice=game.dice.flatMap((_,i)=>a.mask&(1<<i)?[i]:[]);render();$('#selection-info').textContent='Conseil : '+(a.type==='chess'?pieceName[game.chess.board[a.from][1]]+' '+squareName(a.from)+' → '+squareName(a.to):(a.from==='bar'?'Barre':a.from+1)+' → '+(a.to==='off'?'sortie':a.to+1))+' · paiement '+payment(a);}});
$('#rules-button').addEventListener('click',()=>$('#rules-dialog').showModal());$('#close-rules').addEventListener('click',()=>$('#rules-dialog').close());
$('#new-game').addEventListener('click',()=>$('#new-dialog').showModal());$('#cancel-new').addEventListener('click',()=>$('#new-dialog').close());
$('#confirm-new').addEventListener('click',()=>{cancelAI();game=createGame();selected=null;selectedDice=[];promotions=[];$('#new-dialog').close();$('#promotion-dialog').close();render();});
$('#promotion-choices').addEventListener('click',event=>{const button=event.target.closest('[data-promote]');if(!button)return;const a=promotions.find(a=>a.promotion===button.dataset.promote);$('#promotion-dialog').close();if(a)commitAction(a.id);promotions=[];});
$('#view-button').addEventListener('click',event=>{const flat=document.body.classList.toggle('flat');event.target.textContent=flat?'Vue à plat':'Vue en relief';event.target.setAttribute('aria-pressed',String(!flat));});
function focusBoard(which,behavior='smooth') {
  const scroll=$('#board-scroll'),target=which==='chess'?$('.chess-frame'):$('#track-'+which),r=target.getBoundingClientRect(),s=scroll.getBoundingClientRect();
  scroll.scrollTo({left:scroll.scrollLeft+r.left-s.left-(scroll.clientWidth-r.width)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':behavior});
}
for(const button of document.querySelectorAll('[data-focus]'))button.addEventListener('click',()=>focusBoard(button.dataset.focus));
render();requestAnimationFrame(()=>{if(innerWidth<950)focusBoard('chess','auto');});scheduleAI();
