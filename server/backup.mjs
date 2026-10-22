import {DatabaseSync} from 'node:sqlite';
import {chmodSync,closeSync,fsyncSync,linkSync,mkdtempSync,openSync,realpathSync,rmSync,statSync} from 'node:fs';
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function backupDatabase(sourcePath,destinationPath){
 if(!sourcePath||!destinationPath||!isAbsolute(destinationPath))throw new Error('Provide the source database and an absolute, new backup filename.');
 const source=realpathSync(sourcePath),parent=realpathSync(dirname(destinationPath)),destination=resolve(parent,basename(destinationPath));
 if(source===destination)throw new Error('The backup must not overwrite the source database.');
 const temporary=mkdtempSync(resolve(parent,'.rois-backup-'));chmodSync(temporary,0o700);
 const snapshot=resolve(temporary,'snapshot.sqlite');let connection,verification;
 try{
  connection=new DatabaseSync(source,{readOnly:true,enableDoubleQuotedStringLiterals:false});connection.exec('PRAGMA busy_timeout = 5000');
  connection.prepare('VACUUM INTO ?').run(snapshot);connection.close();connection=null;chmodSync(snapshot,0o600);
  verification=new DatabaseSync(snapshot,{readOnly:true,enableDoubleQuotedStringLiterals:false});
  const checks=verification.prepare('PRAGMA quick_check').all();
  if(checks.length!==1||Object.values(checks[0])[0]!=='ok')throw new Error('SQLite rejected the backup integrity check.');
  verification.close();verification=null;
  const fd=openSync(snapshot,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
  linkSync(snapshot,destination);
  const dir=openSync(parent,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
  return {path:destination,bytes:statSync(destination).size};
 }finally{verification?.close();connection?.close();rmSync(temporary,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify({event:'backup_verified',...backupDatabase(process.env.DATABASE_PATH,process.argv[2])}));}
 catch{console.error('Backup failed. Set DATABASE_PATH and provide a new absolute output path in an existing private directory.');process.exitCode=1;}
}
