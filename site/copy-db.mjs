// Makes a consistent copy of a FutureSight database, safe while its server is running:
//   node copy-db.mjs <source.sqlite> <destination.sqlite>
// Used by Start-LocalTest.ps1 so a test copy never writes to the beta's database.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import path from 'node:path';
const [src,dst]=process.argv.slice(2).map(p=>p&&path.resolve(p));
if(!src||!dst)throw new Error('Usage: node copy-db.mjs <source.sqlite> <destination.sqlite>');
if(src===dst)throw new Error('Source and destination are the same file.');
if(!existsSync(src))throw new Error('No database at '+src);
if(existsSync(dst))throw new Error('Refusing to overwrite '+dst);
const db=new DatabaseSync(src,{readOnly:true});
try{db.prepare('VACUUM INTO ?').run(dst);}finally{db.close();}
console.log('Copied '+src+' -> '+dst);
