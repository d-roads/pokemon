// Market metrics: each card's returns, risk, liquidity, population and relative value per grade, and
// indices for the whole market, each era, set, Pokémon, rarity tier and artist.
//
// A card's mark for a grade is its price guide (ungraded, Grade 9, PSA 10): the monthly guide history
// from its full page, plus a point for each day the guide was read (set sweeps and card pages). Guide
// prices exist for nearly every card and are read the same way each day, so cards and indices compare
// like with like. Sold medians from matching sales are kept beside them, never mixed in.
// Languages are never mixed: English and Japanese cards have their own indices and peers.
//
// Indices are chain-linked: from one date to the next, only members priced on both dates count, so a
// card joining or leaving never moves the level. `level` is value-weighted (sum of marks, like a market
// cap); `level_eq` is equal-weighted (average log change), which shows how the typical card did.
import {analyze,median} from './analysis.mjs';
import {charactersOf} from './invest.mjs';

export const METRIC_GRADES=['raw','psa9','psa10'];
export const METRIC_GUIDE_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
export const METRIC_RULES={
 dailyMaxAge:15,     // a daily guide point stands for at most this many days
 monthlyMaxAge:45,   // a monthly history point stands for at most this many days
 heartbeat:14,       // an unchanged daily price is saved again after this many days
 retMaxAge:{1:3,7:8,30:20,90:45,180:45,365:45}, // the price at each end of a return must be this fresh
 minMembers:3,       // an index needs this many members priced on both dates to move
 clip:[.2,5],        // one member's change between two dates is limited to this range
 shrink:3,           // premiums are shrunk toward zero as if this many average cards were added
 minPeers:4,         // peers needed for a relative-value premium
 dailyDays:100,      // index levels are daily for this many days, then month-end
 months:120,
 volMonths:12,minVolMonths:6,
 salesMaxAge:45,     // sales windows need a full page read this recently
 flowMonths:12,      // money flow: sales value per month for this many months before the current one
 listCap:25,         // a card page lists about 30 recent sales; a list this long may be missing older months
 trackMonths:24,minTrackMonths:8, // beta and correlation with the era index: monthly changes over 2 years
};
export const RETURN_DAYS=[1,7,30,90,365];
const MET_DAY=86400000;
export const dayNum=d=>Math.floor(Date.parse(String(d).length===10?d+'T00:00:00Z':d)/MET_DAY);
export const dayStr=n=>new Date(n*MET_DAY).toISOString().slice(0,10);
const metMonthEnd=ym=>{const [y,m]=ym.split('-').map(Number);return Math.floor(Date.UTC(y,m,0)/MET_DAY);};
const metLang=c=>c.lang||'en';

// ---------- Groups ----------
export const TIERS=[
 ['sir','Special illustration rare'],['ir','Illustration rare'],['gold','Gold / hyper rare'],['rainbow','Rainbow rare'],
 ['full-art','Full art'],['gallery','Trainer & character gallery'],['shiny','Shiny & radiant'],['gold-star','Gold Star'],
 ['shining','Shining'],['prism','Prism Star'],['ex-era','EX-era Pokémon ex'],['ultra','EX, GX, V & ex'],['holo','Holo rare'],
 ['classic','Classic Collection'],['promo','Promo'],['rare','Rare'],
];
export const TIER_LABEL=Object.fromEntries(TIERS);
// The rarity tier collectors compare a card with. Rarity names differ between eras and languages.
export function tierOf(card){
 const r=String(card.rarity||''),c=card.category;
 if(/special (?:illustration|art) rare/i.test(r))return 'sir';
 if(/^illustration rare|art rare \(ar\)/i.test(r))return 'ir';
 if(/hyper rare|rare secret|^secret rare$|ultra rare \(ur\)|mega ultra rare|mega hyper/i.test(r)&&c==='Secret rare')return 'gold';
 if(/rainbow/i.test(r))return 'rainbow';
 if(c==='Gold Star')return 'gold-star';
 if(c==='Shining'||/rare shining/i.test(r))return 'shining';
 if(c==='Prism Star')return 'prism';
 if(c==='Trainer Gallery'||c==='Galarian Gallery'||/character (?:super )?rare/i.test(r))return 'gallery';
 if(c==='Shiny rare'||c==='Shiny GX'||c==='Shiny Vault'||/shiny|radiant|amazing/i.test(r))return 'shiny';
 if(c==='Full art'||/rare ultra|super rare \(sr\)/i.test(r)||(c==='Secret rare'&&/ultra rare/i.test(r)))return 'full-art';
 if(c==='Secret rare')return 'gold';
 if(c==='Pokémon ex')return 'ex-era';
 if(['Pokémon EX','Pokémon GX','V','VMAX','VSTAR','ex','BREAK','Pokémon LV.X','Prime','LEGEND'].includes(c))return 'ultra';
 if(c==='Holo rare')return 'holo';
 if(c==='Classic Collection')return 'classic';
 if(c==='Promo')return 'promo';
 return 'rare';
}
// Japanese illustrators come from the checklist; an English card takes the illustrator of its verified
// Japanese printing (the same artwork).
export function artistOf(card,byId){
 if(card.illustrator)return card.illustrator;
 if(card.languagePairVerified&&card.japaneseIds?.length)return byId.get(card.japaneseIds[0])?.illustrator||null;
 return null;
}
// Energy cards are not characters.
export const charactersOfCard=card=>card.nameIsJapanese?[]:charactersOf(card.name).filter(n=>!/\bEnergy$/i.test(n));
// Index ids: "<lang>:<kind>:<key>", e.g. en:set:base1, en:char:Charizard, ja:tier:sir, en:all:all.
export function indexKeysOf(card,byId){
 const out=[['all','all'],['era',card.series],['set',card.setId],['tier',tierOf(card)]];
 for(const c of new Set(charactersOfCard(card)))out.push(['char',c]);
 const artist=artistOf(card,byId);if(artist)out.push(['artist',artist]);
 return out.map(([kind,key])=>metLang(card)+':'+kind+':'+key);
}

// ---------- Price series ----------
// Points oldest first, as typed arrays: d (day number), p (price), m (1 = from monthly history). A monthly
// point is dated at the month's end, or the day its page was read if that came first (a month in progress).
export function buildSeries(history,read,daily){
 const pts=new Map();
 for(const [ym,cents] of history||[]){if(!/^\d{4}-\d{2}$/.test(ym)||!(cents>0))continue;const d=Math.min(metMonthEnd(ym),read??Infinity);pts.set(d,[cents/100,1]);}
 for(const [day,price] of daily||[])if(price>0)pts.set(typeof day==='number'?day:dayNum(day),[price,0]);
 const keys=[...pts.keys()].sort((a,b)=>a-b),n=keys.length,out={length:n,d:new Int32Array(n),p:new Float64Array(n),m:new Uint8Array(n)};
 keys.forEach((d,i)=>{const [p,m]=pts.get(d);out.d[i]=d;out.p[i]=p;out.m[i]=m;});
 return out;
}
function metPointAt(series,t){let lo=0,hi=series.length-1,at=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(series.d[mid]<=t){at=mid;lo=mid+1;}else hi=mid-1;}return at;}
// The mark on day t, or null when the nearest earlier point is too old to stand for it.
export function priceAt(series,t,rules=METRIC_RULES,maxAge=null){
 const i=metPointAt(series,t);if(i<0)return null;const limit=Math.min(series.m[i]?rules.monthlyMaxAge:rules.dailyMaxAge,maxAge??Infinity);
 return t-series.d[i]<=limit?series.p[i]:null;
}
// Change over n days: the newest point must fall inside the period and both ends must be fresh.
export function seriesReturn(series,t,n,rules=METRIC_RULES){
 const i=metPointAt(series,t);if(i<0||series.d[i]<=t-n)return null;
 const age=rules.retMaxAge[n]??45,now=priceAt(series,t,rules,age),then=priceAt(series,t-n,rules,age);
 return now>0&&then>0?now/then-1:null;
}
const metStdev=xs=>{if(xs.length<2)return null;const m=xs.reduce((a,b)=>a+b,0)/xs.length;return Math.sqrt(xs.reduce((a,x)=>a+(x-m)**2,0)/(xs.length-1));};
// Month-end values for the last `months` months, newest first, then annualised volatility of their log changes.
function metMonthEnds(t,months){const out=[];const d=new Date(t*MET_DAY);for(let k=0;k<=months;k++){out.push(Math.min(t,Math.floor(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-k+1,0)/MET_DAY)));}return out;}
function metVolatility(values,rules){const r=[];for(let k=0;k+1<values.length;k++)if(values[k]>0&&values[k+1]>0)r.push(Math.log(values[k]/values[k+1]));return r.length>=rules.minVolMonths?metStdev(r)*Math.sqrt(12):null;}

// ---------- One card ----------
// Everything that needs only this card's own record. `daily` is {raw:[[day,price]],...} from price_points;
// `pops` is this card's PSA population counts over time [[day, counts]], oldest first.
export function cardFacts(card,market,daily,pops,today,rules=METRIC_RULES){
 const read=market?.research?.checkedAt?dayNum(market.research.checkedAt):null,out={};
 const psa=market?.pop?.psa,popTotal=Array.isArray(psa)?psa.reduce((a,b)=>a+(b||0),0):null;
 let popGrowth=null;
 if(popTotal&&pops?.length){const then=[...pops].reverse().find(([d])=>d<=today-90);if(then){const n=then[1].reduce((a,b)=>a+(b||0),0);if(n>0)popGrowth=popTotal/n-1;}}
 for(const g of METRIC_GRADES){
  const series=buildSeries(market?.history?.[METRIC_GUIDE_KEY[g]],read,daily?.[g]),price=priceAt(series,today,rules);
  const a=market?analyze(market,g,15,today*MET_DAY+MET_DAY-1):null;
  const sales=a?a.all:[],fresh=read!=null&&market.research?.status==='full'&&today-read<=rules.salesMaxAge;
  const inWindow=n=>sales.filter(s=>{const d=dayNum(s.date);return d>read-n&&d<=read;});
  const recent=[],carry=priceAt(series,today-365,rules);let high=null;
  for(let i=0;i<series.length&&series.d[i]<=today;i++){high=Math.max(high??0,series.p[i]);if(series.d[i]>today-365)recent.push(series.p[i]);}
  if(carry)recent.push(carry);
  out[g]={series,price,
   // In RETURN_DAYS order (an object keyed 1…365 would make V8 allocate 366 slots per card).
   returns:RETURN_DAYS.map(n=>seriesReturn(series,today,n,rules)),
   high52:recent.length&&price?Math.max(...recent,price):null,low52:recent.length&&price?Math.min(...recent,price):null,
   drawdown:price&&high?price/high-1:null,
   volatility:metVolatility(metMonthEnds(today,rules.volMonths).map(t=>priceAt(series,t,rules)),rules),
   sold:a?.fair??null,soldSales:a?.sampleCount??0,
   sales30:fresh?inWindow(30).length:null,sales90:fresh?inWindow(90).length:null,value90:fresh?inWindow(90).reduce((n,s)=>n+s.price,0):null,
   daysSinceSale:sales.length?today-dayNum(sales[0].date):null,
   flows:metFlows(sales,today,rules),
  };
 }
 return {grades:out,popTotal,pop10:Array.isArray(psa)?psa[9]||0:null,gemRate:popTotal?(psa[9]||0)/popTotal:null,popGrowth};
}

// Sales count and value per month for money flow. A card page lists only its most recent sales, so a long
// list counts only from the first whole month after its oldest sale; `from` is that month.
const metYm=t=>dayStr(t).slice(0,7);
export function flowMonths(today,rules=METRIC_RULES){const d=new Date(today*MET_DAY),out=[];for(let k=rules.flowMonths;k>=0;k--)out.push(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-k,1)).toISOString().slice(0,7));return out;}
function metFlows(sales,today,rules){
 if(!sales.length)return {from:'',months:null};
 let from='';
 if(sales.length>=rules.listCap){const oldest=sales.at(-1).date,[y,m]=oldest.split('-').map(Number);from=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);}
 const first=flowMonths(today,rules)[0],months=new Map();
 for(const x of sales){const ym=x.date.slice(0,7);if(ym<first||ym<from||x.date>dayStr(today))continue;const v=months.get(ym)||[0,0];v[0]++;v[1]+=x.price;months.set(ym,v);}
 return {from,months};
}

// ---------- Dates ----------
// Index dates, oldest first: month ends for `months` months, then every day for `dailyDays`, plus the
// exact days a year and half a year ago so those returns are not rounded to a month end.
export function indexDates(today,rules=METRIC_RULES){
 const set=new Set(metMonthEnds(today,rules.months));
 for(let k=0;k<rules.dailyDays;k++)set.add(today-k);
 set.add(today-365);set.add(today-180);
 return [...set].sort((a,b)=>a-b);
}

// ---------- Everything ----------
// facts: Map card id -> cardFacts(...). Returns rows for card_metrics and index_metrics (objects) and
// market_index (arrays in HISTORY_COLUMNS order, to keep a full rebuild small).
// A rebuild computes for several seconds, so it yields to other work every `slice` ms (`pause` waits a turn).
const metTicker=(pause,slice=30)=>{let t=Date.now();return async()=>{if(pause&&Date.now()-t>=slice){await pause();t=Date.now();}};};
export async function buildMetrics(catalog,facts,today,rules=METRIC_RULES,{pause=null}={}){
 const tick=metTicker(pause);
 const byId=new Map(catalog.map(c=>[c.id,c])),dates=indexDates(today,rules),D=dates.length,at=new Map(dates.map((d,i)=>[d,i])),days=dates.map(dayStr);
 const members=[...facts.keys()].map(id=>byId.get(id)).filter(c=>c?.eligible);
 const cardRows=[],indexRows=[],historyRows=[],flowRows=[],fMonths=flowMonths(today,rules);
 for(const g of METRIC_GRADES){
  // Marks on every index date.
  const marks=new Map();
  // A grade's series is no longer needed once its marks are taken, so it is released here.
  for(const c of members){await tick();const f=facts.get(c.id).grades[g],s=f.series;f.series=null;if(!s?.length)continue;const row=new Float64Array(D);let any=false;for(let i=0;i<D;i++){const p=priceAt(s,dates[i],rules);row[i]=p??NaN;if(p)any=true;}if(any)marks.set(c.id,row);}
  // Peer medians on every date: same language, era and rarity category, or the language and category if too few.
  const peerKey=c=>metLang(c)+'|'+c.series+'|'+c.category,wideKey=c=>metLang(c)+'|'+c.category,groups=new Map();
  for(const c of members){if(!marks.has(c.id))continue;for(const k of [peerKey(c),'*'+wideKey(c)])(groups.get(k)||groups.set(k,[]).get(k)).push(marks.get(c.id));}
  const peerMedian=new Map();
  for(const [k,rows] of groups){await tick();const med=new Float64Array(D),n=new Int32Array(D);for(let i=0;i<D;i++){const v=[];for(const r of rows)if(r[i]>0)v.push(r[i]);n[i]=v.length;med[i]=v.length?median(v):NaN;}peerMedian.set(k,{med,n});}
  // Log premium of each card over its peers on every date (NaN when unpriced or too few peers).
  const logPremium=new Map();
  for(const c of members){
   const row=marks.get(c.id);if(!row)continue;const out=new Float64Array(D).fill(NaN),near=peerMedian.get(peerKey(c)),wide=peerMedian.get('*'+wideKey(c));
   for(let i=0;i<D;i++){if(!(row[i]>0))continue;const p=near&&near.n[i]-1>=rules.minPeers?near:wide&&wide.n[i]-1>=rules.minPeers?wide:null;if(p&&p.med[i]>0)out[i]=Math.log(row[i]/p.med[i]);}
   logPremium.set(c.id,out);
  }
  const last=D-1;
  // Cards.
  for(const c of members){
   const f=facts.get(c.id),m=f.grades[g];
   const other=metLang(c)==='en'?(c.languagePairVerified&&c.japaneseIds?.[0]):c.englishId,otherPrice=other?facts.get(other)?.grades[g].price:null;
   const premium=logPremium.get(c.id)?.[last];
   cardRows.push({card_id:c.id,grade:g,lang:metLang(c),as_of:dayStr(today),price:m.price,sold:m.sold,
    ret_1d:m.returns[0],ret_7d:m.returns[1],ret_30d:m.returns[2],ret_90d:m.returns[3],ret_1y:m.returns[4],
    high_52w:m.high52,low_52w:m.low52,drawdown:m.drawdown,volatility:m.volatility,
    sales_30d:m.sales30,sales_90d:m.sales90,value_90d:m.value90,days_since_sale:m.daysSinceSale,
    spread_10_9:metRatio(f.grades.psa10.price,f.grades.psa9.price),spread_10_raw:metRatio(f.grades.psa10.price,f.grades.raw.price),
    pop_total:f.popTotal,pop_10:f.pop10,gem_rate:f.gemRate,pop_growth_90d:f.popGrowth,
    lang_gap:m.price&&otherPrice?otherPrice/m.price-1:null,premium:Number.isFinite(premium)?Math.exp(premium):null});
  }
  // Indices.
  const byIndex=new Map();
  for(const c of members)for(const id of indexKeysOf(c,byId))(byIndex.get(id)||byIndex.set(id,[]).get(id)).push(c);
  // Top 100: today's most valuable cards per language (membership is today's, so its history flatters).
  for(const lang of ['en','ja']){const top=members.filter(c=>metLang(c)===lang&&marks.get(c.id)?.[last]>0).sort((a,b)=>marks.get(b.id)[last]-marks.get(a.id)[last]).slice(0,100);if(top.length)byIndex.set(lang+':top100:top100',top);}
  const cardRet=new Map(cardRows.filter(r=>r.grade===g).map(r=>[r.card_id,r])),eraLevels=new Map();
  for(const [id,list] of byIndex){
   await tick();
   const rowsOf=list.map(c=>marks.get(c.id)).filter(Boolean);if(!rowsOf.length)continue;
   const level=new Float64Array(D).fill(NaN),levelEq=new Float64Array(D).fill(NaN),value=new Float64Array(D),count=new Int32Array(D),prem=new Float64Array(D).fill(NaN);
   for(let i=0;i<D;i++){let v=0,n=0;for(const r of rowsOf)if(r[i]>0){v+=r[i];n++;}value[i]=v;count[i]=n;}
   let started=false;
   for(let i=0;i<D;i++){
    if(!started){if(count[i]>=rules.minMembers){level[i]=100;levelEq[i]=100;started=true;}continue;}
    let a=0,b=0,logs=0,n=0;
    for(const r of rowsOf){const p0=r[i-1],p1=r[i];if(!(p0>0&&p1>0))continue;const q=Math.min(rules.clip[1],Math.max(rules.clip[0],p1/p0));a+=p0;b+=p0*q;logs+=Math.log(q);n++;}
    level[i]=n>=rules.minMembers?level[i-1]*b/a:level[i-1];levelEq[i]=n>=rules.minMembers?levelEq[i-1]*Math.exp(logs/n):levelEq[i-1];
   }
   // Premium: how far above same-era, same-rarity peers the members sell, averaged and shrunk.
   const premRows=list.map(c=>logPremium.get(c.id)).filter(Boolean);
   for(let i=0;i<D;i++){let s=0,n=0;for(const r of premRows)if(Number.isFinite(r[i])){s+=r[i];n++;}if(n)prem[i]=Math.exp(s/(n+rules.shrink));}
   for(let i=0;i<D;i++)if(level[i]>0)historyRows.push([id,g,days[i],metRound(level[i]),metRound(levelEq[i]),count[i],metRound(value[i]),metFin(prem[i])]);
   // Money flow: matching sales per month across members whose page covers that month.
   for(const ym of fMonths){let n=0,v=0,covered=0;for(const c of list){const f=facts.get(c.id).grades[g].flows;if(!f.months||ym<f.from)continue;covered++;const x=f.months.get(ym);if(x){n+=x[0];v+=x[1];}}if(covered)flowRows.push([id,g,ym,n,metRound(v),covered]);}
   if(id.split(':')[1]==='era')eraLevels.set(id,levelEq);
   if(!(level[last]>0))continue;
   const lv=t=>{const i=at.get(t);return i!=null&&level[i]>0?level[i]:null;},eq=t=>{const i=at.get(t);return i!=null&&levelEq[i]>0?levelEq[i]:null;};
   const ret=(f,n)=>{const a=f(today),b=f(today-n);return a&&b?a/b-1:null;};
   const yearLevels=[];for(let i=0;i<D;i++)if(dates[i]>today-365&&level[i]>0)yearLevels.push(level[i]);
   const ends=metMonthEnds(today,rules.volMonths).map(t=>{const i=at.get(t);return i!=null&&level[i]>0?level[i]:null;});
   const peak=Math.max(...[...level].filter(v=>v>0));
   const priced=list.filter(c=>marks.get(c.id)?.[last]>0),vals=priced.map(c=>marks.get(c.id)[last]).sort((a,b)=>b-a),total=vals.reduce((a,b)=>a+b,0);
   const rets=priced.map(c=>cardRet.get(c.id)?.ret_30d).filter(v=>v!=null);
   const sum=k=>{let s=0,n=0;for(const c of list){const v=cardRet.get(c.id)?.[k];if(v!=null){s+=v;n++;}}return n?s:null;};
   // Short returns come from members' own returns, which need a fresh price at both ends: a level carried
   // forward between reads would put a week's change on the day it was read.
   const shortRet=k=>{let then=0,now=0,n=0;for(const c of list){const r=cardRet.get(c.id);if(r?.[k]==null||!(r.price>0))continue;const p0=r.price/(1+r[k]);then+=p0;now+=r.price;n++;}return n>=rules.minMembers?now/then-1:null;};
   const pops=list.map(c=>facts.get(c.id)).filter(f=>f.popTotal>0),popTotal=pops.reduce((a,f)=>a+f.popTotal,0);
   const [lang,kind,...rest]=id.split(':'),key=rest.join(':');
   indexRows.push({index_id:id,grade:g,lang,kind,key,as_of:dayStr(today),level:metRound(level[last]),
    ret_1d:shortRet('ret_1d'),ret_7d:shortRet('ret_7d'),ret_30d:ret(lv,30),ret_90d:ret(lv,90),ret_1y:ret(lv,365),
    eq_ret_30d:ret(eq,30),eq_ret_90d:ret(eq,90),eq_ret_1y:ret(eq,365),
    high_52w:yearLevels.length?Math.max(...yearLevels):null,low_52w:yearLevels.length?Math.min(...yearLevels):null,
    drawdown:peak>0?level[last]/peak-1:null,volatility:metVolatility(ends,rules),
    members:list.length,priced:priced.length,value:metRound(total),top5_share:total>0?vals.slice(0,5).reduce((a,b)=>a+b,0)/total:null,
    up_30d:rets.filter(v=>v>0).length,down_30d:rets.filter(v=>v<0).length,breadth_30d:rets.length?rets.filter(v=>v>0).length/rets.length:null,
    sales_30d:sum('sales_30d'),sales_90d:sum('sales_90d'),value_90d:sum('value_90d'),
    premium:metFin(prem[last]),premium_90d:metFin(prem[at.get(today-90)]),premium_1y:metFin(prem[at.get(today-365)]),
    gem_rate:popTotal?pops.reduce((a,f)=>a+(f.pop10||0),0)/popTotal:null});
  }
  // How closely each card follows its era's typical card: beta and correlation of monthly changes.
  const ends=metMonthEnds(today,rules.trackMonths).reverse().map(t=>at.get(t)).filter(i=>i!=null);
  for(const c of members){
   const row=marks.get(c.id),era=eraLevels.get(metLang(c)+':era:'+c.series),r=cardRet.get(c.id);if(!row||!era||!r)continue;
   const t=metTracking(ends.map(i=>row[i]),ends.map(i=>era[i]),rules);r.beta=t.beta;r.correl=t.correl;
  }
 }
 return {cardRows,indexRows,historyRows,flowRows,dates:days};
}
const metRatio=(a,b)=>a>0&&b>0?a/b:null;
// Beta and correlation of a card's month-to-month log changes against its index, over months where both
// have a price at both ends. A card whose guide did not change for most months has no meaningful beta.
export function metTracking(card,index,rules=METRIC_RULES){
 const x=[],y=[];
 for(let k=1;k<card.length;k++)if(card[k-1]>0&&card[k]>0&&index[k-1]>0&&index[k]>0){y.push(Math.log(card[k]/card[k-1]));x.push(Math.log(index[k]/index[k-1]));}
 if(x.length<rules.minTrackMonths||y.filter(v=>v!==0).length<rules.minTrackMonths/2)return {beta:null,correl:null};
 const mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;let sxy=0,sxx=0,syy=0;
 for(let k=0;k<x.length;k++){sxy+=(x[k]-mx)*(y[k]-my);sxx+=(x[k]-mx)**2;syy+=(y[k]-my)**2;}
 return {beta:sxx>0?metRound(sxy/sxx):null,correl:sxx>0&&syy>0?metRound(sxy/Math.sqrt(sxx*syy)):null};
}
const metRound=v=>Number.isFinite(v)?Math.round(v*10000)/10000:null;
const metFin=v=>Number.isFinite(v)?v:null;
