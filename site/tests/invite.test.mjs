import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {accountStore,newInviteCode,normalizeInvite} from '../lib/accounts.mjs';

const fresh=()=>{const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));return {db,store:accountStore(db)};};

test('Invite codes are readable, unambiguous and stored only as hashes',()=>{
 const {db,store}=fresh();const code=store.createInvite('Sam');
 assert.match(code,/^FS-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
 const stored=JSON.stringify(db.prepare('SELECT * FROM invites').all());
 assert.ok(!stored.includes(code)&&!stored.includes(normalizeInvite(code)));
 assert.notEqual(newInviteCode(),newInviteCode());
});
test('An invite creates one account, then stops working',()=>{
 const {store}=fresh();const code=store.createInvite('Sam');
 const sam=store.create('sam','abcde',undefined,{invite:' '+code.toLowerCase().replace(/-/g,' ')+' '});
 assert.equal(sam.account.username,'sam');
 const again=store.create('sam2','abcde',undefined,{invite:code});
 assert.equal(again.status,403);assert.equal(store.exists('sam2'),false);
 const [row]=store.listInvites();assert.equal(row.username,'sam');assert.equal(row.label,'Sam');assert.ok(row.used_at);
});
test('Bad or missing invites create nothing, and a taken username keeps the code unused',()=>{
 const {store}=fresh();const code=store.createInvite();
 assert.equal(store.create('pat','abcde',undefined,{invite:'FS-AAAAA-AAAAA'}).status,403);
 assert.equal(store.create('pat','abcde',undefined,{invite:''}).status,400);
 assert.equal(store.create('pat','abcde',undefined,{invite:null}).status,400);
 assert.equal(store.create('pat','abcde',undefined,{invite:undefined}).status,400);
 assert.equal(store.exists('pat'),false);
 store.create('taken','abcde');
 assert.equal(store.create('TAKEN','abcde',undefined,{invite:code}).status,409);
 assert.equal(store.listInvites()[0].used_at,null);
 assert.ok(store.create('pat','abcde',undefined,{invite:code}).account);
});
test('Accounts made on the home network still need no invite',()=>{
 const {store}=fresh();assert.ok(store.create('homeuser','abcde').account);
});
