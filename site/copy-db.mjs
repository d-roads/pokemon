// Makes a consistent copy of a FutureSight database, safe while its server is running:
//   node copy-db.mjs <source.sqlite> <destination.sqlite> [--replace-empty]
// Used by Start-LocalTest.ps1 so a test copy never writes to the beta's database.
// --replace-empty: if the destination exists but holds no accounts (a blank test database from an
// earlier start that could not find the beta), it is replaced by the copy. Anything else is kept.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,rmSync} from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),replaceEmpty=args.includes('--replace-empty');
const [src,dst]=args.filter(a=>!a.startsWith('--')).map(p=>path.resolve(p));
if(!src||!dst)throw new Error('Usage: node copy-db.mjs <source.sqlite> <destination.sqlite> [--replace-empty]');
if(src===dst)throw new Error('Source and destination are the same file.');
if(!existsSync(src))throw new Error('No database at '+src);
if(existsSync(dst)){
 let accounts=0;
 try{const d=new DatabaseSync(dst,{readOnly:true});try{accounts=d.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='accounts'").get().n?d.prepare('SELECT count(*) AS n FROM accounts').get().n:0;}finally{d.close();}}catch{accounts=0;}
 if(!replaceEmpty||accounts>0){console.log('Kept the existing test database ('+accounts+' accounts): '+dst);process.exit(0);}
 for(const f of [dst,dst+'-wal',dst+'-shm'])rmSync(f,{force:true});
 console.log('Replacing the empty test database.');
}
const db=new DatabaseSync(src,{readOnly:true});
try{db.prepare('VACUUM INTO ?').run(dst);}finally{db.close();}
console.log('Copied '+src+' -> '+dst);
