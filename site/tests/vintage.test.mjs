import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,sets,series} from '../data/catalog.mjs';
import {matchesCard,gradeOf} from '../lib/sales.mjs';
import {classifyCapture,expandCapture} from '../lib/capture.mjs';
import {parseMarket,parseSet} from '../lib/provider.mjs';
import {trendProjection} from '../lib/analysis.mjs';
import {investmentScores,gradeShare} from '../lib/score.mjs';
import {charactersOf} from '../lib/invest.mjs';
import {measureMove} from '../lib/movers.mjs';
const card=id=>cards.find(c=>c.id===id),now=Date.parse('2026-10-06'),DAY=86400000;
test('Wizards catalog covers every pre-EX English set, promos and e-Card subsets',()=>{
 assert.equal(sets.filter(s=>s.series==='WOTC').length,18);assert.equal(cards.filter(c=>c.vintage).length,1789);assert.equal(cards.filter(c=>c.vintage&&c.eligible).length,741);
 assert.ok(series.some(s=>s.id==='WOTC'));assert.equal(card('base1-4').name,'Charizard');assert.equal(card('ecard2-H1').numberLabel,'H1/H32');assert.equal(card('ecard3-H32').numberLabel,'H32/H32');assert.equal(card('basep-1').numberLabel,'1');assert.equal(card('si1-1').nativeReverse,true);
});
test('Vintage matching separates printing, character, number and holo treatment',()=>{
 const c=card('base1-4');assert.ok(matchesCard('Charizard Base Set 4/102 Holo PSA 9',c));
 for(const title of ['Charizard Base Set 4/102 1st Edition PSA 9','Charizard 4/102 Shadowless PSA 9','Charizard 4/102 1999-2000 PSA 9','Charizard 4/102 Non Holo NM','Charizard 4/130 Holo PSA 9','Blastoise 4/102 Holo PSA 9','Charizard Base Set PSA 4'])assert.equal(matchesCard(title,c),false,title);
 assert.ok(matchesCard('Ampharos Aquapolis H1/H32 PSA 9',card('ecard2-H1')));assert.equal(matchesCard('Ampharos Aquapolis 1/147 PSA 9',card('ecard2-H1')),false);
 assert.equal(matchesCard('Mewtwo Promo #9 PSA 9',card('basep-9')),false);
 assert.ok(matchesCard('Mew Southern Islands 1/18 Reverse Holo NM',card('si1-1')));
 assert.equal(matchesCard('Charizard Legendary Collection 3/110 Reverse Holo NM',card('base6-3')),false);
});
test('Unverified products and wrong vintage pages cannot supply guides',()=>{
 const c={...card('base1-4'),sourceVerified:true};
 assert.throws(()=>parseMarket('PriceCharting <td id="used_price">$100</td>',{...c,sourceVerified:false}),/exact source/);
 assert.throws(()=>parseMarket('PriceCharting <h1 id="product_name">Blastoise #2 Pokemon Base Set</h1><td id="used_price">$100</td>',c),/does not match/);
 const row=n=>`<tr><td class="title">${n}</td><td class="price">$100</td><td class="price">$200</td><td class="price">$300</td></tr>`;
 assert.throws(()=>parseSet(row('Charizard #4'),[{...c,sourceVerified:false}]));
 assert.throws(()=>parseSet(row('Blastoise #4'),[c]));
});
test('Capture keeps provenance and reports snapshot limits while rejecting invalid dates',()=>{
 const c=card('base1-4'),r=classifyCapture({fetchedAt:'2026-10-06T00:00:00Z',url:c.source,rows:[['graded','2026-10-01',100,null,'ebay-123456789','Charizard 4/102 PSA 9','ebay:123456789'],['graded','2026-02-30',100,null,'bad','Charizard 4/102 PSA 9',''],['graded','2026-12-01',100,null,'future','Charizard 4/102 PSA 9','']]},c);
 assert.equal(r.sales.length,1);assert.equal(r.coverage.sourceRows,3);assert.equal(r.coverage.completeEbayHistory,false);assert.equal(expandCapture(r,c).sales[0].source,'https://www.ebay.com/itm/123456789');
});
test('An entirely old dataset expires scores and movers against the actual day',()=>{
 const c=card('base1-4'),m={observedAt:'2026-08-01',sales:Array.from({length:8},(_,i)=>({id:String(i),date:'2026-07-'+(20+i),grade:'psa9',price:100+i}))};
 const result=investmentScores([[c,m]],{now});assert.equal(result.full.get(c.id).psa9.score,null);assert.match(result.full.get(c.id).psa9.reason,/out of date/);assert.equal(measureMove(m,'psa9','week',{now}).reason,'stale');
});
test('Vintage owners and Dark/Light forms contribute to the underlying character demand',()=>{
 for(const name of ['Dark Charizard','Light Charizard',"Blaine's Charizard"])assert.deepEqual(charactersOf(name),['Charizard']);assert.deepEqual(charactersOf("Lt. Surge's Raichu"),['Raichu']);
 assert.equal(gradeShare({psa:[0,0,0,0,0,0,0,0,30,-1]},'psa9'),null);
});
test('Forecasts withhold missing references, duplicate evidence, stale data and failed holdouts',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:String(i),date:new Date(now-(330-i*30)*DAY).toISOString().slice(0,10),price:100+i*3}));
 for(const current of [null,undefined,0,Infinity,NaN])assert.equal(trendProjection(rows,current,now).available,false);
 assert.equal(trendProjection(Array(12).fill(rows[0]),100,now).available,false);
 const reversal=rows.map((s,i)=>({...s,price:i<8?100+i*30:80}));assert.equal(trendProjection(reversal,80,now).available,false);
 assert.equal(trendProjection(rows,133,now+120*DAY).available,false);
 const p=trendProjection(rows,133,now);assert.equal(p.available,true);assert.equal(p.validation.saleDays,4);assert.deepEqual(trendProjection([...rows].reverse(),133,now).values,p.values);
});

test('Best of Game keeps native reverse foil and Winner prints separate',()=>{
 assert.equal(card('bp-1').numberLabel,'1/9');
 assert.ok(matchesCard('Electabuzz Best of Game 1/9 Reverse Holo Non-Winner NM',card('bp-1')));
 assert.equal(matchesCard('Electabuzz Best of Game 1/9 Reverse Holo Winner NM',card('bp-1')),false);
 assert.ok(matchesCard("Rocket's Mewtwo Best of Game 8/9 Reverse Holo Winner Stamp PSA 9",card('bp-8')));
 assert.equal(matchesCard("Rocket's Mewtwo Best of Game 8/9 Non-Winner PSA 9",card('bp-8')),false);
 assert.ok(matchesCard('Computer Error #16 Pokemon Promo PSA 9',card('basep-16')));
 assert.equal(matchesCard('Charizard 4/102 1. Edition PSA 9',card('base1-4')),false);
});

test('Base Machamp explicitly tracks the shadowed first-edition deck print',()=>{
 const c=card('base1-8');assert.equal(c.printing,'1st Edition / shadowed');
 assert.ok(matchesCard('Machamp 8/102 Base Set 1st Edition PSA 9',c));
 for(const title of ['Machamp 8/102 Base Set PSA 9','Machamp 8/102 Base Set 1st Edition Shadowless PSA 9','Machamp 8/102 1st Edition 1999-2000 PSA 9'])assert.equal(matchesCard(title,c),false);
});

test('The word of in set names is not a PSA OF qualifier',()=>{
 assert.equal(gradeOf('Electabuzz Best of Game 1/9 PSA 9'),'psa9');assert.equal(gradeOf('Lugia Call of Legends SL7 PSA 10'),'psa10');
 assert.equal(gradeOf('Electabuzz 1/9 PSA 9 (OF)'),null);assert.equal(gradeOf('Electabuzz 1/9 PSA 9 OF'),null);
});

test('Repeated TCGPlayer URLs retain separate dated sales in captures',()=>{
 const c=card('base1-4'),r={url:c.source,guide:{},sales:[['2026-10-01',100,'raw','NM','t','https://tcgplayer.com/product/123','Charizard 4/102 NM'],['2026-10-02',110,'raw','NM','t','https://tcgplayer.com/product/123','Charizard 4/102 NM']]};
 const rows=expandCapture(r,c).sales;assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
});
