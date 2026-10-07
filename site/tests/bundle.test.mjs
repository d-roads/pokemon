import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {cards} from '../data/catalog.mjs';
import {matchesCard} from '../lib/sales.mjs';
import {rejectReason,shouldReplace,serialize,months} from '../../tools/research/bundle-captures.mjs';

const card=cards.find(c=>c.id==='ex2-10'),record=(over={})=>({fetchedAt:'2026-10-07T08:00:00Z',url:card.source,name:'Sableye #10 Pokemon Sandstorm',guide:{raw:10},history:{raw:[['2025-01',100],['2025-02',110]]},sales:[['2026-09-01',10,'raw','NM','e','ebay-1','Sableye']],...over});

test('Bundling accepts only exact English captures for the card',()=>{
 assert.equal(rejectReason(card,record(),matchesCard),null);
 assert.equal(rejectReason(undefined,record(),matchesCard),'unknown-card');
 assert.equal(rejectReason(cards.find(c=>c.japanese),record(),matchesCard),'japanese');
 assert.equal(rejectReason(card,record({url:'https://www.pricecharting.com/search-products?q=sableye+10'}),matchesCard),'search-redirect');
 assert.equal(rejectReason(card,record({url:card.source+'-x'}),matchesCard),'url-mismatch');
 assert.equal(rejectReason(card,{url:card.source},matchesCard),'malformed');
 const vintage=cards.find(c=>c.vintage&&c.sourceVerified&&c.eligible);
 assert.equal(rejectReason(vintage,record({url:vintage.source,name:'Something Else #999'}),matchesCard),'name-mismatch');
});

test('A bundled capture is replaced only by a newer record that is at least as complete',()=>{
 const old=record({fetchedAt:'2026-10-01T00:00:00Z'});
 assert.equal(shouldReplace(null,record()),true);
 assert.equal(shouldReplace(old,record()),true);
 assert.equal(shouldReplace(record(),old),false,'older');
 assert.equal(shouldReplace(old,record({history:{raw:[['2025-01',100]]}})),false,'fewer months');
 assert.equal(shouldReplace(old,record({sales:[]})),false,'fewer sales');
 assert.equal(months(record()),2);
});

test('Bundled capture files are deterministic and never point at a search page',()=>{
 assert.equal(serialize({b:{x:1},a:{y:2}}),'{\n"a":{"y":2},\n"b":{"x":1}\n}\n');
 // A pretty-printed file keeps its format and card order; new cards are appended.
 const pretty=JSON.stringify({z:{n:1},a:{n:2}},null,2)+'\n';
 assert.equal(serialize({z:{n:1},a:{n:2},m:{n:3}},pretty),JSON.stringify({z:{n:1},a:{n:2},m:{n:3}},null,2)+'\n');
 const dir=new URL('../data/pricecharting/',import.meta.url);
 for(const f of readdirSync(dir).filter(n=>n.endsWith('.json')))for(const [id,r] of Object.entries(JSON.parse(readFileSync(new URL(f,dir),'utf8'))))assert.doesNotMatch(r.url||'',/search-products/,id);
});
