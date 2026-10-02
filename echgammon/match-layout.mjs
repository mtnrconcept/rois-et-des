// Layout only: the existing view remains the owner of rules, selection and saves.
const $ = selector => document.querySelector(selector);
const compactMedia = matchMedia('(max-width: 1000px), (max-height: 600px)');
const portraitMedia = matchMedia('(max-width: 600px) and (orientation: portrait)');
const options = $('#match-options-dialog');
const help = $('#match-help-dialog');
const tools = $('.tools');
const sound = $('.sound-tools');
const teaching = $('#learning-panel');
const anchors = new Map();
for (const node of [tools, sound, teaching]) {
  const anchor = document.createComment('match layout return position');
  node.before(anchor);
  anchors.set(node, anchor);
}
const journal = $('.journal');
$('#match-options-content').append($('#match-guidance'), journal, $('.salon > footer'));
journal.open = true;

function openDrawer(dialog) {
  if (!dialog.open) dialog.showModal();
}
$('#match-options').addEventListener('click', () => openDrawer(options));
$('#match-help').addEventListener('click', () => openDrawer(help));
for (const dialog of [options, help]) {
  dialog.querySelector('[data-close-drawer]').addEventListener('click', () => dialog.close());
}
// Guides anchor to the board, so dismiss the drawer before the guide handler runs.
help.addEventListener('click', event => {
  const hint = event.target.closest('#training-hint');
  if (event.target.closest('#training-solution, #restart-guide, #retry-exercise') || hint && /3\/3|dernier indice/.test(hint.textContent)) help.close();
}, true);
options.addEventListener('click', event => {
  if (event.target.closest('#rules-button, #new-game, #fleet-toggle, #explain-move')) options.close();
}, true);

function setPane(which) {
  if (!['left', 'chess', 'right'].includes(which)) return;
  document.body.dataset.matchPane = which;
  document.querySelectorAll('[data-focus]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.focus === which));
  });
  sizeBoard();
}
setPane('chess');
document.addEventListener('click', event => {
  const button = event.target.closest('[data-focus]');
  if (button) setPane(button.dataset.focus);
}, true);
document.addEventListener('match:focus-board', event => setPane(event.detail?.which));

function updateMode() {
  const compact = compactMedia.matches;
  document.body.classList.toggle('match-compact', compact);
  document.body.classList.toggle('match-portrait', portraitMedia.matches);
  for (const node of [tools, sound, teaching]) {
    const target = node === teaching ? $('#match-help-content') : $('#match-options-content');
    if (compact) {
      if (node.parentNode !== target) target.append(node);
    } else {
      if (options.open) options.close();
      if (help.open) help.close();
      anchors.get(node).after(node);
    }
  }
  $('#match-help').hidden = !compact || teaching.hidden;
  $('#match-options').textContent = compact ? 'Options' : 'Journal & options';
  sizeBoard();
}

function sizeBoard() {
  const room = $('#board-scroll');
  const stage = $('.cabinet-stage');
  if (!room || room.clientWidth < 20 || room.clientHeight < 20) return;
  const compact = compactMedia.matches;
  const roomStyle = getComputedStyle(room), cabinetStyle = getComputedStyle($('#cabinet'));
  const number = (style, prop) => parseFloat(prop.startsWith('--') ? style.getPropertyValue(prop) : style[prop]) || 0;
  const width = Math.max(0, room.clientWidth - number(roomStyle,'paddingLeft') - number(roomStyle,'paddingRight'));
  const height = Math.max(0, room.clientHeight - number(roomStyle,'paddingTop') - number(roomStyle,'paddingBottom') - 9);
  const horizontal = number(cabinetStyle,'paddingLeft') + number(cabinetStyle,'paddingRight') + 4;
  const vertical = number(cabinetStyle,'paddingTop') + number(cabinetStyle,'paddingBottom') + 4;
  // The portrait overview is a square chess board between two race strips.
  // The same 24 buttons are laid out by CSS; focusing a track keeps its square zoom.
  const overview = portraitMedia.matches && document.body.dataset.matchPane === 'chess';
  const raceRatio = number(cabinetStyle,'--portrait-race-ratio') || .2;
  const portraitRatio = (number(cabinetStyle,'--portrait-chess-ratio') || .8) + raceRatio * 2;
  const cabinetWidth = Math.min(width, overview ? (height - vertical - number(cabinetStyle,'rowGap') * 2) / portraitRatio + horizontal : compact ? height - vertical + horizontal : (height - vertical) * 4.25 / 2.25 + horizontal + number(cabinetStyle,'columnGap') * 2);
  stage.style.setProperty('--cabinet-width', `${Math.max(80, Math.floor(cabinetWidth))}px`);
  const stripHeight = Math.max(20, Math.floor((cabinetWidth - horizontal) * raceRatio));
  stage.style.setProperty('--race-strip-height', `${stripHeight}px`);
  if (overview) {
    const checkerWidth = Math.min(raceRatio < .2 ? 12 : 17, (cabinetWidth - horizontal - 18) / 12 * .85);
    stage.style.setProperty('--checker-step', `${Math.max(1, (stripHeight - checkerWidth - 9) / 4)}px`);
    return;
  }
  const pointHeight = Math.max($('#track-left').clientHeight, $('#track-right').clientHeight) / 2 - 9;
  stage.style.setProperty('--checker-step', `${Math.max(7, Math.min(20, (pointHeight - 38) / 5))}px`);
}

const fleetToggle = $('#fleet-toggle');
const quickFleet = $('#match-quick-fleet');
quickFleet.addEventListener('click', () => fleetToggle.click());
function syncFleetButton() {
  const active = fleetToggle.getAttribute('aria-pressed') === 'true';
  quickFleet.textContent = active ? 'Vue 2D' : 'Vue 3D';
  quickFleet.setAttribute('aria-pressed', String(active));
  quickFleet.disabled = fleetToggle.disabled;
}
new MutationObserver(syncFleetButton).observe(fleetToggle, {attributes:true, attributeFilter:['aria-pressed', 'disabled']});
new MutationObserver(() => { $('#match-help').hidden = !compactMedia.matches || teaching.hidden; }).observe(teaching, {attributes:true, attributeFilter:['hidden']});
const observer = new ResizeObserver(sizeBoard);
function observeBoard() { observer.observe($('#board-scroll')); sizeBoard(); }
observeBoard();
compactMedia.addEventListener('change', updateMode);
portraitMedia.addEventListener('change', updateMode);
window.addEventListener('resize', sizeBoard);
window.addEventListener('pagehide', () => observer.disconnect());
window.addEventListener('pageshow', () => { observeBoard(); updateMode(); });
updateMode();
syncFleetButton();
