import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {measureMove,topMovers,MOVER_RULES} from '../lib/movers.mjs';

const NOW=Date.parse('2026-10-01T20:00:00Z');
const day=n=>new Date(Date.parse('2026-10-01T00:00:00Z')-n*86400000).toISOString().slice(0,10);
// Build a market from [daysAgo, price] pairs for one grade.
const market=(grade,rows,extra={})=>({observedAt:'2026-10-01T12:00:00Z',guide:{},sales:rows.map(([ago,price],i)=>({id:grade+i,grade,date:day(ago),price,condition:grade==='raw'?'NM':''})),...extra});
const steadyBaseline=[[9,100],[13,98],[17,102],[22,100],[27,101]];

test('A confirmed weekly rise is measured from the two sold medians',()=>{
 const m=market('psa10',[[0,130],[2,128],[5,132],...steadyBaseline]);
 const r=measureMove(m,'psa10','week',{now:NOW});
 assert.equal(r.ok,true);assert.equal(r.from,100);assert.equal(r.to,130);assert.ok(Math.abs(r.change-.3)<1e-9);
 assert.equal(r.current.sales,3);assert.equal(r.baseline.sales,5);assert.equal(r.current.end,'2026-10-01');assert.equal(r.current.start,'2026-09-25');
});
test('Movers fail closed on thin, cheap, one-off, scattered, spiking or guide-contradicting evidence',()=>{
 const reason=(rows,extra,grade='psa10')=>measureMove(market(grade,rows,extra),grade,'week',{now:NOW}).reason;
 assert.equal(reason([[0,130],[2,128],...steadyBaseline]),'thin');                         // only 2 new sales
 assert.equal(reason([[0,130],[0,128],[0,132],...steadyBaseline]),'thin');                 // all on one day
 assert.equal(reason([[0,26],[2,26],[5,26],[9,20],[13,20],[17,20]]),'floor');              // under $25 at the start
 assert.equal(reason([[0,250],[1,102],[2,101],[4,99],[5,98],...steadyBaseline]),'inconsistent'); // one high sale
 assert.equal(reason([[0,130],[2,128],[5,132],[9,100],[13,60],[17,140],[22,100],[27,45],[28,240]]),'scattered');
 assert.equal(reason([[0,300],[2,310],[5,305],...steadyBaseline]),'spike');               // +200% on 3 sales
 assert.equal(reason([[0,130],[2,128],[5,132],...steadyBaseline],{guide:{psa10:40}}),'guide');
 assert.equal(reason([[0,90],[2,92],[5,95],...steadyBaseline]),'flat');
 assert.equal(measureMove(market('psa10',[[0,130],[2,128],[5,132],...steadyBaseline]),'psa10','week',{now:NOW,newest:Math.floor(NOW/86400000)+9}).reason,'stale');
});
test('Raw movers count near-mint sales only',()=>{
 const m=market('raw',[[0,130],[2,128],[5,132],...steadyBaseline]);
 for(const s of m.sales.slice(0,3))s.condition='LP';
 assert.equal(measureMove(m,'raw','week',{now:NOW}).reason,'thin');
});
test('Top movers over the real data are capped, sorted and pass every rule',()=>{
 const entries=cards.map(c=>[c,snapshots[c.id]]);
 for(const period of ['week','month']){
  const r=topMovers(entries,period);
  assert.deepEqual(Object.keys(r.grades),['psa10','psa9','raw']);assert.ok(r.checkedAt);
  for(const [grade,col] of Object.entries(r.grades)){
   assert.ok(col.movers.length<=MOVER_RULES.limit);assert.ok(col.qualified>=col.movers.length);
   col.movers.forEach((m,i)=>{
    assert.equal(m.grade,grade);assert.ok(m.change>0);assert.ok(m.from>=25);
    assert.ok(m.current.sales>=3&&m.baseline.sales>=3);
    if(i)assert.ok(col.movers[i-1].change>=m.change);
    assert.ok(cards.find(c=>c.id===m.card_id).eligible);
   });
  }
  assert.ok(r.grades.raw.movers.length>0,'some raw card should qualify in the snapshot');
 }
 // The month view, with more evidence, fills all 20 places for every grade.
 const month=topMovers(entries,'month');for(const col of Object.values(month.grades))assert.equal(col.movers.length,20);
});
