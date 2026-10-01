import extraSnapshots from './xy-market.json' with {type:'json'};
import gradedSnapshots from './xy-graded-market.json' with {type:'json'};
import promoSnapshots from './promo-market.json' with {type:'json'};
import researched from './researched-sales.json' with {type:'json'};
import {mergeMarket} from '../lib/sales.mjs';
import {expandCapture,mergeCapture} from '../lib/capture.mjs';
import {cards} from './catalog.mjs';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
// Source observations collected September 30, 2026. No invented transactions.
export const observedAt='2026-10-01T00:10:00Z';
const guides={
  9:[9.72,67,480.01],25:[.82,13.41,35],26:[3.44,34,57.69],29:[2.19,21.37,98.24],33:[1.64,29,60],36:[24.62,78,428.67],37:[2.56,66.15,79],38:[5.30,43.50,116.88],41:[1.99,55,66],53:[2.52,16,72.51],54:[9.22,107.67,161.81],55:[28.76,165.42,575.01],60:[1.34,15,40.89],69:[3.29,14,125],71:[2.89,20,46.31],77:[4.25,33.02,416.41],81:[.99,18,38.11],85:[7.71,77.63,401.07],86:[38,140,1100],91:[3.68,32,213.75],93:[4.83,28.03,1150],94:[13.79,55.61,510],104:[7.60,25.94,178.06],105:[7.15,61.57,90.15],106:[19.49,82.45,332.27],108:[8.55,87.50,350],117:[1.99,18.27,46.30],121:[1.45,12.89,36.97],145:[15.22,81.02,485],146:[18.76,107.25,539.98],147:[23.98,265.46,504.57],148:[86,649.95,3014.82],149:[105.48,1260.41,2713.34],150:[88.07,619.81,3550.63],151:[108.80,1762.87,3394.20],152:[21.39,206.29,3591.03],153:[27.63,180,1913],154:[45.39,308.49,3172],155:[41.95,369.43,993.22],156:[53.02,250,9935.14],157:[19.25,54.55,1894.12],159:[18.19,54.69,1499.25],160:[19.99,55.84,1993.17]
};
const sales = [];
function add(number,grade,entries){for(const [date,price,condition=''] of entries){sales.push({id:`${number}-${grade}-${date}-${price}`,number,grade,date,price,condition,marketplace:'eBay',provenance:'PriceCharting reported sale',source:`https://www.pricecharting.com/game/pokemon-primal-clash/${({147:'wailord-ex',151:'primal-groudon-ex',55:'primal-kyogre-ex',156:'m-gardevoir-ex'})[number]}-${number}`});}}
add(147,'psa9',[['2026-09-24',350],['2026-08-09',257],['2026-07-01',304.95],['2026-04-24',250],['2026-04-09',202.51],['2026-04-05',178.38],['2026-03-17',169.5],['2026-03-10',167.5]]);
add(55,'psa9',[['2026-09-28',185],['2026-07-30',180],['2026-07-14',155],['2026-06-26',211.33],['2026-05-21',145]]);
add(55,'psa10',[['2025-09-28',925],['2025-09-27',890],['2025-02-01',549.99],['2025-01-02',575]]);
add(151,'psa9',[['2026-09-27',2599.99],['2026-09-27',2500],['2026-09-23',2250],['2026-09-22',1999],['2026-09-22',1706.48],['2026-08-04',1800],['2026-07-24',1552],['2026-07-14',1300],['2026-07-13',1800],['2026-07-09',1100],['2026-06-25',1325],['2026-06-12',1351],['2026-05-31',920]]);
add(151,'psa10',[['2025-04-26',4999.99],['2025-04-06',3650],['2025-03-13',3157.52],['2021-01-22',500]]);
add(156,'psa10',[['2026-08-18',10000],['2022-09-12',400],['2022-05-18',400],['2022-02-27',285]]);
add(147,'raw',[['2026-09-29',30.87,'Unknown'],['2026-09-29',27,'Unknown'],['2026-09-29',38,'Unknown'],['2026-09-28',23.95,'Unknown'],['2026-09-26',20.25,'NM/LP'],['2026-09-26',38,'NM/LP'],['2026-09-25',14,'Unknown'],['2026-09-25',22.5,'Unknown'],['2026-09-24',25.46,'LP']]);
add(151,'raw',[['2026-09-30',84.99,'MP'],['2026-09-29',117.5,'Unknown'],['2026-09-28',114.99,'Unknown'],['2026-09-25',110.49,'Unknown'],['2026-09-23',63,'Damaged'],['2026-09-23',189.99,'NM'],['2026-09-21',84.99,'MP'],['2026-09-14',129.99,'NM'],['2026-09-14',115,'LP']]);
add(156,'raw',[['2026-09-30',38,'Unknown'],['2026-09-27',70,'LP'],['2026-09-27',46.31,'NM'],['2026-09-25',46,'Unknown'],['2026-09-23',76,'Unknown'],['2026-09-20',32,'Unknown']]);
const primalSnapshots=Object.fromEntries(Object.entries(guides).map(([n,p])=>[`xy5-${n}`,{number:Number(n),guide:{raw:p[0],grade9:p[1],psa10:p[2]},sales:sales.filter(s=>s.number===Number(n)),observedAt,source:'PriceCharting',status:'snapshot'}]));

const baselines={...extraSnapshots,...gradedSnapshots,...promoSnapshots,...primalSnapshots};
for(const [id,m]of Object.entries(baselines))m.guideSources=Object.fromEntries(Object.entries(m.guide).filter(([,v])=>v>0).map(([key])=>[key,{name:m.source,url:m.sourceUrl||cards.find(c=>c.id===id)?.source,observedAt:m.observedAt}]));
const observations={...researched},batches=new URL('./sales-batches/',import.meta.url);
for(const name of readdirSync(batches).filter(n=>n.endsWith('.json')).sort())for(const [id,m]of Object.entries(JSON.parse(readFileSync(new URL(name,batches),'utf8'))))observations[id]=mergeMarket(observations[id],m);
const legacy=Object.fromEntries(Object.keys({...baselines,...observations}).map(id=>[id,mergeMarket(baselines[id],observations[id])]));
// Full page captures (data/pricecharting/<set>.json) supersede the excerpt-based batches above.
const captureDir=new URL('./pricecharting/',import.meta.url),captures={};
if(existsSync(captureDir))for(const name of readdirSync(captureDir).filter(n=>n.endsWith('.json')).sort())Object.assign(captures,JSON.parse(readFileSync(new URL(name,captureDir),'utf8')));
const cardById=new Map(cards.map(c=>[c.id,c]));
export const snapshots={...legacy};
for(const [id,record] of Object.entries(captures)){const card=cardById.get(id);if(card)snapshots[id]=mergeCapture(legacy[id],expandCapture(record,card));}
export const captureCount=Object.keys(captures).length;
