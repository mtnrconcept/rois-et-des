/** Shared original SVG pieces and CSS dice. */
const paths={
 P:'M31 49 Q29 60 25 73 L55 73 Q51 60 49 49Z M28 45 Q40 38 52 45 L49 51H31Z M51 26A11 11 0 1 1 29 26A11 11 0 1 1 51 26Z',
 R:'M27 34H53L50 48L53 73H27L30 48Z M22 17H30V25H35V17H45V25H50V17H58L55 38H25Z',
 B:'M31 47H49L52 73H28Z M24 43Q23 30 40 12Q57 30 56 43Q40 55 24 43Z M28 53H52L51 57H29Z',
 N:'M25 72Q27 62 29 56L22 50L25 42L35 30L36 16L43 21L49 17L52 31Q63 42 58 62L57 73Z M29 45L39 42L43 34',
 Q:'M29 47H51L53 73H27Z M21 25L31 34L34 18L40 33L47 18L49 34L59 25L53 49H27Z M25 51H55L52 56H28Z',
 K:'M29 48H51L52 73H28Z M24 34Q40 27 56 34L51 50H29Z M36 10H44V18H52V26H44V34H36V26H28V18H36Z'
};
export function pieceSVG(p,id) {
  const light=p[0]==='w',grad='piece-'+id,colors=light?['#785224','#d7b477','#fff0c7','#af8750']:['#080706','#30271e','#74634d','#100c09'];
  const detail=p[1]==='B'?'<path d="M43 22L34 38" stroke="#49301f" stroke-width="2"/>':p[1]==='N'?'<circle cx="43" cy="33" r="2" fill="#100d09"/>':p[1]==='Q'?'<g fill="url(#'+grad+')"><circle cx="21" cy="24" r="3"/><circle cx="34" cy="17" r="3"/><circle cx="47" cy="17" r="3"/><circle cx="59" cy="24" r="3"/></g>':'';
  return `<svg class="chess-piece" viewBox="0 0 80 100" aria-hidden="true"><defs><linearGradient id="${grad}"><stop offset="0" stop-color="${colors[0]}"/><stop offset=".28" stop-color="${colors[1]}"/><stop offset=".53" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[3]}"/></linearGradient></defs><ellipse cx="41" cy="94" rx="28" ry="5" fill="#0004"/><g fill="url(#${grad})" stroke="${light?'#70532d':'#080705'}" stroke-width="1.1" stroke-linejoin="round"><path d="M23 72Q40 67 57 72L60 79L56 84H24L20 79Z"/><path d="${paths[p[1]]}"/><path d="M21 79H59L65 88Q64 96 40 96Q16 96 15 88Z"/><ellipse cx="40" cy="81" rx="21" ry="4"/><path d="M18 88Q39 94 62 88" fill="none" stroke="${light?'#f7dfad':'#998466'}" opacity=".6"/></g>${detail}</svg>`;
}
export function cube(value) {
  const top=[1,6].includes(value)?2:1,right=[1,2,3,4,5,6].find(n=>![value,7-value,top,7-top].includes(n));
  const dots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  return '<span class="cube">'+Object.entries({front:value,back:7-value,top,bottom:7-top,right,left:7-right}).map(([face,v])=>`<span class="face ${face}">${dots[v].map(n=>`<i class="pip" style="grid-area:${Math.floor(n/3)+1}/${n%3+1}"></i>`).join('')}</span>`).join('')+'</span>';
}
