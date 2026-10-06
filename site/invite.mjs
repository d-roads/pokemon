// Makes invite codes for people joining FutureSight through the internet link.
//   node invite.mjs                one code
//   node invite.mjs 3              three codes
//   node invite.mjs 1 "Sam"        one code with a note saying who it is for
//   node invite.mjs list           every code made so far: who it was for and who used it
// Each code works once. Codes are shown only now, so copy them before closing the window.
// Safe to run while the server is running.
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {accountStore} from './lib/accounts.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const sqlite=new DatabaseSync(path.join(root,'data','primal-watch.sqlite'));
sqlite.exec('PRAGMA busy_timeout = 5000');
const store=accountStore(sqlite);
const [first,label='']=process.argv.slice(2);

if(first==='list'){
 const rows=store.listInvites();
 if(!rows.length)console.log('No invite codes yet. Make one with: node invite.mjs');
 for(const r of rows)console.log(`${r.created_at.slice(0,10)}  ${(r.label||'(no note)').padEnd(20)}  ${r.used_at?`used by ${r.username||'?'} on ${r.used_at.slice(0,10)}`:'not used yet'}`);
}else{
 const count=first===undefined?1:Number(first);
 if(!Number.isInteger(count)||count<1||count>50){console.error('Usage: node invite.mjs [how many, 1-50] ["note"]   or   node invite.mjs list');process.exit(1);}
 console.log(count===1?'Invite code (works once):':`${count} invite codes (each works once):`);
 for(let i=0;i<count;i++)console.log('  '+store.createInvite(label));
 console.log('\nSend each tester the internet link and their code. They choose "Create account" and enter it.');
}
sqlite.close();
