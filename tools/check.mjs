import {readdirSync,readFileSync,statSync} from 'node:fs';import {resolve,relative} from 'node:path';import {spawnSync} from 'node:child_process';
const root=resolve(new URL('..',import.meta.url).pathname),skip=new Set(['.git','dist','node_modules','data']);
function walk(dir){return readdirSync(dir).flatMap(name=>{if(skip.has(name))return[];const p=resolve(dir,name),s=statSync(p);return s.isDirectory()?walk(p):[p];});}
const modules=walk(root).filter(p=>/\.(mjs|js)$/.test(p));let failed=false;
for(const file of modules){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){failed=true;console.error(relative(root,file),r.stderr);}}
const forbidden=walk(root).filter(p=>!p.includes('/.git/')).filter(p=>{const s=readFileSync(p);return s.includes(Buffer.from('sk-proj-'))||s.includes(Buffer.from('sk_live_'));});
if(forbidden.length){failed=true;console.error('Potential secret in',forbidden.map(p=>relative(root,p)));}
if(failed)process.exit(1);console.log(`Checked ${modules.length} JavaScript modules and credential patterns.`);
