import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {investmentScores,priceMomentum,heldHigh,scoreRating,gradeShare,scarcityTable,scarcityPart,partsFor,SCORE_RULES,SCORE_PARTS} from '../lib/score.mjs';

const DAY=86400000,end=Math.floor(Date.parse('2026-10-01')/DAY);
const iso=age=>new Date((end-age)*DAY).toISOString().slice(0,10);
const sales=list=>({comparable:list.map(([age,price])=>({date:iso(age),price}))});
const scored=investmentScores(cards.map(c=>[c,snapshots[c.id]]));

test('Momentum is measured only with enough sales across the year, and its clarity is reported',()=>{
 assert.equal(priceMomentum(sales([[1,100],[20,99],[40,98],[60,97]]),end),null,'four sales are too few');
 assert.equal(priceMomentum(sales([[1,100],[10,99],[20,98],[30,97],[40,96],[50,95]]),end),null,'under 90 days is too short');
 const rising=priceMomentum(sales([[5,150],[40,140],[90,128],[150,118],[220,108],[300,101],[340,98]]),end);
 assert.ok(rising.growth>.4&&rising.growth<.7,'about +50% a year');assert.ok(rising.t>3,'a clean rise is statistically clear');
 const falling=priceMomentum(sales([[5,60],[60,72],[120,80],[200,92],[300,101],[340,108]]),end);
 assert.ok(falling.growth<-.3&&falling.t<-3);
});

test('A held high must last several months; a one-month blip does not count',()=>{
 const months=n=>Array.from({length:n},(_,i)=>{const d=new Date(Date.UTC(2023,i,1));return d.toISOString().slice(0,7);});
 const flat=months(30).map(ym=>[ym,10000]);
 const blip=flat.map(([ym,v],i)=>[ym,i===10?40000:v]);
 assert.equal(heldHigh(blip).peak,100,'the $400 blip is ignored');
 const held=flat.map(([ym,v],i)=>[ym,i>=8&&i<=13?30000:i>=26?15000:v]);
 const h=heldHigh(held);assert.equal(h.peak,300);assert.ok(Math.abs(h.drawdown-.5)<1e-9);
 assert.equal(heldHigh(months(6).map(ym=>[ym,100])),null,'needs a year of history');
});

test('Ratings follow the published bands',()=>{
 assert.deepEqual([90,80,79,65,64,50,49,35,34,0].map(scoreRating),['Strong','Strong','Good','Good','Fair','Fair','Weak','Weak','Poor','Poor']);
 assert.equal(scoreRating(null),null);
 assert.equal(Object.values(SCORE_RULES.weights).reduce((a,b)=>a+b,0).toFixed(6),'1.000000');
 assert.equal(Object.values(SCORE_RULES.gradedWeights).reduce((a,b)=>a+b,0).toFixed(6),'1.000000');
 assert.ok(!partsFor('raw').some(([k])=>k==='scarcity'),'raw cards have no grade scarcity');
 assert.ok(partsFor('psa10').some(([k])=>k==='scarcity')&&partsFor('psa9').some(([k])=>k==='scarcity'));
});

test('Grade scarcity ranks low PSA 10 and PSA 9-or-better rates higher, within the era',()=>{
 const pop=(n9,n10,rest=100)=>({psa:[0,0,0,0,0,0,rest,0,n9,n10]});
 assert.deepEqual(gradeShare(pop(50,50),'psa10'),{share:.25,count:50,total:200,tens:50,nines:50});
 assert.equal(gradeShare(pop(50,50),'psa9').share,.5,'PSA 9 uses 9-or-better');
 assert.equal(gradeShare(pop(5,5,10),'psa10'),null,'needs 30+ graded copies');
 assert.equal(gradeShare(pop(50,50),'raw'),null);
 // 25 EX cards with gem rates 1%..25%, 25 SM cards with 30%..54%.
 const rows=[];for(let i=0;i<25;i++){rows.push({card:{series:'EX'},market:{pop:pop(0,i+1,99-i)}});rows.push({card:{series:'SM'},market:{pop:pop(0,30+i,70-i)}});}
 const table=scarcityTable(rows),low=scarcityPart(table,rows[0],'psa10'),high=scarcityPart(table,rows[48],'psa10');
 assert.ok(low.score>=95&&high.score<=5,`${low.score} ${high.score}`);
 // An SM card at 30% is the rarest in its era even though EX cards are all lower.
 assert.ok(scarcityPart(table,rows[1],'psa10').score>=95);assert.match(low.detail,/EX-era/);
 const none=scarcityPart(table,{card:{series:'EX'},market:{}},'psa10');assert.equal(none.score,50);assert.ok(none.neutral);
});

test('Investment scores over the real data are bounded, explained and fail closed',()=>{
 const ids=Object.keys(scored.scores);assert.ok(ids.length>1500,'most priced rare cards get a score');
 let counts={psa10:0,psa9:0,raw:0};
 for(const [id,byGrade] of scored.full){
  for(const [g,s] of Object.entries(byGrade)){
   if(s.score==null){assert.ok(s.reason.length>10);continue;}
   counts[g]++;
   assert.ok(Number.isInteger(s.score)&&s.score>=0&&s.score<=100,id);
   assert.ok(s.price>0,'a score needs a confident sold price');
   assert.deepEqual(s.parts.map(p=>p.key),partsFor(g).map(([k])=>k));
   for(const p of s.parts){assert.ok(p.score>=0&&p.score<=100);assert.ok(p.detail.length>10);}
   const blended=Math.round(s.parts.reduce((t,p)=>t+p.weight*p.score,0));
   assert.equal(s.score,s.belowFloor?Math.min(blended,SCORE_RULES.belowFloorCap):blended);
   if(s.price<SCORE_RULES.minPrice)assert.ok(s.score<=59,'cards under $25 are capped');
   assert.equal(scored.scores[id][['psa10','psa9','raw'].indexOf(g)],s.score);
  }
 }
 assert.ok(counts.psa10>200&&counts.psa9>400&&counts.raw>1000,JSON.stringify(counts));
 const all=Object.values(scored.scores).flat().filter(v=>v!=null).sort((a,b)=>a-b);
 assert.ok(all.at(-1)>=80&&all[0]<40,'the scale is actually used');
 // Unscored cards fail closed rather than borrowing a guide price.
 const noSales=cards.find(c=>c.eligible&&!snapshots[c.id]);if(noSales)assert.equal(scored.scores[noSales.id],undefined);
});
