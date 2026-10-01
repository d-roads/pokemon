import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {validateEntry,entryValue,summarize,portfolioSeries,priceHistory,valueAt} from '../lib/portfolio.mjs';
const now=Date.parse('2026-10-01T12:00:00Z');
const market={guide:{psa10:600},sales:[100,110,120].map((price,i)=>({grade:'psa9',date:'2026-09-2'+i,price})),history:{grade9:[['2026-06',9000],['2026-07',9500],['2026-08',10500],['2026-09',11000]],psa10:[['2026-08',60000]]}};
test('Dex entries are validated before saving',()=>{
 assert.deepEqual(validateEntry({card_id:'xy5-151',grade:'psa9'},{cards,today:'2026-10-01'}).entry,{card_id:'xy5-151',grade:'psa9',quantity:1,purchase_price:null,purchase_date:null,notes:''});
 assert.equal(validateEntry({card_id:'xy5-151',grade:'psa9',purchase_price:'12.345'},{cards}).entry.purchase_price,12.35);
 for(const bad of [{card_id:'x',grade:'psa9'},{card_id:'xy5-151',grade:'cgc10'},{card_id:'xy5-151',grade:'raw',quantity:1.5},{card_id:'xy5-151',grade:'raw',purchase_date:'2026-02-30'},{card_id:'xy5-151',grade:'raw',purchase_date:'2026-10-02'}])assert.ok(validateEntry(bad,{cards,today:'2026-10-01'}).errors.length,JSON.stringify(bad));
});
test('An entry is worth its sold median, with P/L against what was paid',()=>{
 const v=entryValue({grade:'psa9',quantity:2,purchase_price:90},market,now);
 assert.equal(v.unit,110);assert.equal(v.value,220);assert.equal(v.cost,180);assert.equal(v.pl,40);assert.ok(Math.abs(v.plPct-0.2222)<0.001);assert.equal(v.basis,'sold median');
 const g=entryValue({grade:'psa10',quantity:1,purchase_price:700},market,now);assert.equal(g.unit,600);assert.equal(g.basis,'source guide');assert.equal(g.pl,-100);
 const none=entryValue({grade:'raw',quantity:1,purchase_price:5},{},now);assert.equal(none.value,null);assert.equal(none.pl,null);
});
test('Collection totals compare only cards that have both a price and a cost',()=>{
 const s=summarize([{card_id:'a',grade:'psa9',quantity:1,purchase_price:100},{card_id:'b',grade:'raw',quantity:1,purchase_price:50},{card_id:'a',grade:'psa10',quantity:1,purchase_price:null}],id=>id==='a'?market:{},now);
 assert.equal(s.value,710);assert.equal(s.cost,150);assert.equal(s.comparedCost,100);assert.equal(s.pl,10);assert.equal(s.unpriced,1);assert.equal(s.noCost,1);assert.equal(s.cards,3);
});
test('Value over time follows monthly history from each purchase month',()=>{
 assert.deepEqual(priceHistory(market,'psa9')[0],['2026-06',90]);assert.equal(valueAt(priceHistory(market,'psa9'),'2026-07'),95);assert.equal(valueAt(priceHistory(market,'psa9'),'2026-05'),null);
 const series=portfolioSeries([{card_id:'a',grade:'psa9',quantity:1,purchase_price:92,purchase_date:'2026-07-04'}],()=>market,now);
 assert.deepEqual(series.map(p=>p.month),['2026-07','2026-08','2026-09','2026-10']);
 assert.deepEqual(series.map(p=>p.value),[95,105,110,110]);assert.ok(series.every(p=>p.cost===92));
 assert.deepEqual(portfolioSeries([],()=>market,now),[]);
});
