import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {accountStore,seedAdmin,usernameProblem,passwordProblem,hashPassword,verifyPassword,readCookie,sessionCookie,attemptLimiter} from '../lib/accounts.mjs';

test('Usernames allow only letters, numbers and single separators',()=>{
 for(const ok of ['admin','sam_k','Ash.Ketchum','a-b','abc','x'.repeat(20)])assert.equal(usernameProblem(ok),null,ok);
 for(const bad of ['','ab','x'.repeat(21),'<script>','a b','ab;c',"o'neil",'ab"c','_abc','abc.','a..b','a-_b','émile','a\u0000b','admin\n',null,42])assert.ok(usernameProblem(bad),String(bad));
});
test('Passwords block risky characters and must be repeated exactly',()=>{
 assert.equal(passwordProblem('test1'),null);assert.equal(passwordProblem('P@ssw0rd!#$%','P@ssw0rd!#$%'),null);
 for(const bad of ['abcd','a'.repeat(65),'has space','tab\there','<abcde>','ab"cde',"ab'cde",'ab`cde','ab\\cde','ab;cde','ab&cde','pässwort'])assert.ok(passwordProblem(bad),bad);
 assert.match(passwordProblem('abcde1','abcde2'),/do not match/);
});
test('Password hashes are salted and verified in constant time',()=>{
 const a=hashPassword('test1'),b=hashPassword('test1');assert.notEqual(a,b);assert.match(a,/^scrypt\$/);
 assert.equal(verifyPassword('test1',a),true);assert.equal(verifyPassword('test2',a),false);assert.equal(verifyPassword('test1',null),false);
});
test('Accounts are unique regardless of case, and sessions map to their own storage key',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 const store=accountStore(db);
 const admin=seedAdmin(store,'test1','local-owner');assert.equal(admin.user_key,'local-owner');assert.equal(seedAdmin(store,'other','x'),null);
 assert.equal(store.create('ADMIN','abcde').status,409);
 const sam=store.create('Sam_K','abcde').account;assert.equal(sam.user_key,'acct-'+sam.id);assert.equal(store.create('sam_k','zzzzz').status,409);
 assert.equal(store.authenticate('admin','wrong'),null);assert.equal(store.authenticate('nobody','test1'),null);
 const a=store.authenticate('Admin','test1');assert.equal(a.user_key,'local-owner');
 const token=store.startSession(a.id);assert.equal(store.sessionUser(token).username,'admin');
 assert.equal(store.sessionUser(token+'x'),null);assert.equal(store.sessionUser("' OR 1=1 --"),null);
 const stored=db.prepare('SELECT token_hash FROM sessions').all().map(r=>r.token_hash);assert.ok(!stored.includes(token));
 store.endSession(token);assert.equal(store.sessionUser(token),null);
 assert.deepEqual(store.userKeys().sort(),['acct-'+sam.id,'local-owner'].sort());
});
test('Expired sessions are refused',()=>{
 let t=new Date('2026-10-06T00:00:00Z');const db=new DatabaseSync(':memory:'),store=accountStore(db,()=>t);
 const {account}=store.create('tester','abcde');const token=store.startSession(account.id);
 t=new Date('2026-11-10T00:00:00Z');assert.equal(store.sessionUser(token),null);
});
test('Session cookies are HttpOnly and SameSite=Strict, and failed sign-ins are rate limited',()=>{
 const c=sessionCookie('abc');assert.match(c,/HttpOnly/);assert.match(c,/SameSite=Strict/);
 assert.equal(readCookie('a=1; fs_session=tok_123; b=2'),'tok_123');assert.equal(readCookie(''),null);
 let now=0;const lim=attemptLimiter({max:3,windowMs:1000,now:()=>now});
 for(let i=0;i<3;i++)lim.fail('ip');assert.ok(lim.blocked('ip')>0);now=1500;assert.equal(lim.blocked('ip'),0);
});
