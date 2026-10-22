import {cpSync,existsSync,mkdirSync,rmSync} from 'node:fs';import {resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname),dist=resolve(root,'dist');rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
for(const name of ['index.html','play.html','online.html','online-match.html','styles.css'])if(existsSync(resolve(root,name)))cpSync(resolve(root,name),resolve(dist,name));
for(const name of ['echgammon','assets'])if(existsSync(resolve(root,name)))cpSync(resolve(root,name),resolve(dist,name),{recursive:true});
console.log('Static build written to dist/. Server, tests, docs and data are excluded.');
