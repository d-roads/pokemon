// Top movers: the biggest percentage price increases over the last week or month, per grade.
//
// A move compares the median of matching sales in the current window (the last 7 or 30 days
// of each card's own sales data) with the median of the window just before it (the 4 weeks or
// 2 months before). It fails closed: a card is only listed when both windows have enough
// matching sales and the move passes every consistency check below. Anything uncertain is
// left out rather than shown.
import {analyze,median} from './analysis.mjs';

const MOVE_DAY=86400000;
export const MOVER_GRADES=['psa10','psa9','raw'];
export const PERIODS={
 week:{label:'Week',current:7,baseline:28,baselineLabel:'the 4 weeks before'},
 month:{label:'Month',current:30,baseline:60,baselineLabel:'the 2 months before'},
};
export const MOVER_RULES={
 minPrice:25,        // the card must have been worth at least this at the start of the period
 minSales:3,         // matching sales required in each window, after outliers are removed
 minDays:2,          // distinct sale days required in each window
 confirmShare:2/3,   // share of current-window sales that must be above the starting price
 spikeChange:1.5,    // moves above +150% need the larger sample below
 spikeSales:5,
 guideBand:[.4,2.5], // the new median must sit within this band of the source's own guide
 maxOutlierShare:.25,// a window where more than this share of sales were outliers is too scattered
 maxSpread:.3,       // nor may the remaining sales sit more than 30% from their median, typically
 staleDays:7,        // card data older than the newest check by more than this is left out
 limit:20,
};
const MOVE_GUIDE_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
const moveDayOf=iso=>Math.floor(Date.parse(iso)/MOVE_DAY);
export const checkedAt=m=>m?.research?.checkedAt||m?.observedAt||null;

// Keep prices within 40%–250% of the window's own median, the same outlier rule as targets.
function moveClean(rows){const mid=median(rows.map(s=>s.price));return mid==null?[]:rows.filter(s=>s.price>=mid*.4&&s.price<=mid*2.5);}
// Typical distance from the median, as a share of it. High values mean there is no settled price.
const moveSpread=rows=>{const mid=median(rows.map(s=>s.price));return mid?median(rows.map(s=>Math.abs(s.price-mid)))/mid:Infinity;};

// One card, one grade, one period. Returns {ok:true,...move} or {ok:false,reason}.
export function measureMove(market,grade,period,{now=Date.now(),newest=null,rules=MOVER_RULES}={}){
 const p=PERIODS[period];if(!p)throw new Error('Unknown period');
 const checked=checkedAt(market);if(!checked)return {ok:false,reason:'thin'};
 const today=Math.floor(now/MOVE_DAY),endDay=Math.min(moveDayOf(checked),today);
 if(newest!=null&&newest-endDay>rules.staleDays)return {ok:false,reason:'stale'};
 // analyze() keeps only matching, de-duplicated sales of this grade (raw: near mint only).
 const comparable=analyze(market,grade,15,endDay*MOVE_DAY+MOVE_DAY-1).comparable;
 const age=s=>endDay-moveDayOf(s.date);
 const currentAll=comparable.filter(s=>age(s)>=0&&age(s)<p.current),baselineAll=comparable.filter(s=>age(s)>=p.current&&age(s)<p.current+p.baseline);
 const current=moveClean(currentAll),baseline=moveClean(baselineAll);
 const days=rows=>new Set(rows.map(s=>s.date)).size;
 if(current.length<rules.minSales||baseline.length<rules.minSales||days(current)<rules.minDays||days(baseline)<rules.minDays)return {ok:false,reason:'thin'};
 const scattered=(all,kept)=>1-kept.length/all.length>rules.maxOutlierShare||moveSpread(kept)>rules.maxSpread;
 const from=median(baseline.map(s=>s.price)),to=median(current.map(s=>s.price)),change=to/from-1;
 if(!(change>0))return {ok:false,reason:'flat'};
 if(from<rules.minPrice)return {ok:false,reason:'floor'};
 if(scattered(currentAll,current)||scattered(baselineAll,baseline))return {ok:false,reason:'scattered'};
 // The rise has to show up across most of the new sales, not in one or two listings.
 if(current.filter(s=>s.price>from).length/current.length<rules.confirmShare)return {ok:false,reason:'inconsistent'};
 if(change>rules.spikeChange&&(current.length<rules.spikeSales||baseline.length<rules.spikeSales))return {ok:false,reason:'spike'};
 // An independent check: the source's own current guide for this grade should broadly agree.
 const guide=market?.guide?.[MOVE_GUIDE_KEY[grade]];
 if(guide>0&&(to<guide*rules.guideBand[0]||to>guide*rules.guideBand[1]))return {ok:false,reason:'guide'};
 const iso=d=>new Date(d*MOVE_DAY).toISOString().slice(0,10);
 return {ok:true,grade,period,from,to,change,
  current:{sales:current.length,start:iso(endDay-p.current+1),end:iso(endDay)},
  baseline:{sales:baseline.length,start:iso(endDay-p.current-p.baseline+1),end:iso(endDay-p.current)}};
}

const MOVE_REASONS={scattered:'sale prices were too scattered to give a reliable price',stale:'its sales data is out of date',inconsistent:'only one or two new sales were higher',spike:'too few sales to confirm a jump that large',guide:'the new median disagrees with the source guide'};

// All cards, all grades, one period. `entries` is [[card, market], ...].
export function topMovers(entries,period,{now=Date.now(),rules=MOVER_RULES}={}){
 const stamps=entries.map(([,m])=>checkedAt(m)).filter(s=>s&&Number.isFinite(Date.parse(s))).sort();
 const newest=stamps.length?Math.min(moveDayOf(stamps.at(-1)),Math.floor(now/MOVE_DAY)):null;
 const result={period,label:PERIODS[period].label,current:PERIODS[period].current,baselineLabel:PERIODS[period].baselineLabel,checkedAt:stamps.at(-1)||null,rules:{minPrice:rules.minPrice,minSales:rules.minSales},grades:{}};
 for(const grade of MOVER_GRADES){
  const moves=[],left={};let measured=0;
  for(const [card,market] of entries){
   if(!card.eligible||!market)continue;
   const r=measureMove(market,grade,period,{now,newest,rules});
   if(r.reason!=='thin')measured++;
   if(r.ok)moves.push({card_id:card.id,...r,ok:undefined});
   else if(MOVE_REASONS[r.reason])left[r.reason]=(left[r.reason]||0)+1;
  }
  moves.sort((a,b)=>b.change-a.change||b.current.sales-a.current.sales||a.card_id.localeCompare(b.card_id));
  result.grades[grade]={movers:moves.slice(0,rules.limit),qualified:moves.length,measured,
   leftOut:Object.entries(left).map(([reason,count])=>({reason,count,text:MOVE_REASONS[reason]}))};
 }
 return result;
}
