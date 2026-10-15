// The Dex: what a collection is worth, what it cost, and how that changed over time.
// Shared by the server and the browser (served at /portfolio.mjs).
import {analyze} from './analysis.mjs';

export const HISTORY_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
export const MIN_PURCHASE_DATE='2010-01-01';
const month=d=>String(d).slice(0,7);
const addMonths=(ym,n)=>{const [y,m]=ym.split('-').map(Number),t=y*12+m-1+n;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0');};

export function validateEntry(input,{cards,today=new Date().toISOString().slice(0,10),existingPurchaseDate=null}){
 const e=input&&typeof input==='object'?input:{},errors=[];
 if(!cards.some(c=>c.id===e.card_id))errors.push('Choose a card from the catalog.');
 if(!['raw','psa9','psa10'].includes(e.grade))errors.push('Choose Raw, PSA 9, or PSA 10.');
 const quantity=e.quantity==null||e.quantity===''?1:Number(e.quantity);
 if(!Number.isInteger(quantity)||quantity<1||quantity>999)errors.push('Quantity must be a whole number from 1 to 999.');
 const price=e.purchase_price==null||e.purchase_price===''?null:Number(e.purchase_price);
 if(price!=null&&(!Number.isFinite(price)||price<0||price>1000000))errors.push('Enter a price paid between $0 and $1,000,000, or leave it blank.');
 const date=e.purchase_date?String(e.purchase_date):null;
 const preservedHistoricalDate=date===existingPurchaseDate&&date<MIN_PURCHASE_DATE;
 if(date&&!preservedHistoricalDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today||date<MIN_PURCHASE_DATE))errors.push('Enter a purchase date from 2010 through today.');
 const notes=e.notes==null?'':String(e.notes).trim().slice(0,280);
 // A sale: the price each copy sold for and the date, both or neither.
 const soldPrice=e.sold_price==null||e.sold_price===''?null:Number(e.sold_price),soldDate=e.sold_date?String(e.sold_date):null;
 if(soldPrice!=null&&(!Number.isFinite(soldPrice)||soldPrice<0||soldPrice>1000000))errors.push('Enter a sale price between $0 and $1,000,000.');
 if((soldPrice==null)!==(soldDate==null))errors.push('Enter both the sale price and the date sold, or neither.');
 if(soldDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(soldDate)||!Number.isFinite(Date.parse(soldDate))||new Date(soldDate).toISOString().slice(0,10)!==soldDate||soldDate>today||soldDate<MIN_PURCHASE_DATE))errors.push('Enter a sale date from 2010 through today.');
 else if(soldDate&&date&&soldDate<date)errors.push('The sale date must be on or after the purchase date.');
 return {errors,entry:{card_id:e.card_id,grade:e.grade,quantity,purchase_price:price==null?null:Math.round(price*100)/100,purchase_date:date,notes,sold_price:soldPrice==null?null:Math.round(soldPrice*100)/100,sold_date:soldDate}};
}

// Price history in dollars per month for one card and grade, from the source's monthly guide.
export function priceHistory(market,grade){
 return (market?.history?.[HISTORY_KEY[grade]]||[]).map(([ym,cents])=>[ym,cents/100]).filter(([,v])=>v>0);
}
export function valueAt(history,ym){
 let v=null;for(const [m,p] of history){if(m<=ym)v=p;else break;}return v;
}

// Current worth of one entry. Uses the sold median for the grade when there are recent sales,
// then the source guide, then the latest monthly history point.
export function entryValue(entry,market,now=Date.now()){
 const a=analyze(market,entry.grade,15,now),history=priceHistory(market,entry.grade);
 let unit=a.current,basis=a.priceSource==='sales'?'sold median':a.priceSource==='guide'?'source guide':null;
 if(unit==null&&history.length){unit=history.at(-1)[1];basis='monthly guide';}
 const qty=entry.quantity||1,cost=entry.purchase_price!=null?entry.purchase_price*qty:null,value=unit!=null?unit*qty:null;
 const pl=value!=null&&cost!=null?value-cost:null;
 return {unit,value,cost,pl,plPct:pl!=null&&cost>0?pl/cost:null,basis,sampleCount:a.sampleCount};
}

// Held entries count toward value and unrealized P/L; sold entries (sold_price set) toward realized P/L.
export function summarize(entries,marketFor,now=Date.now()){
 let value=0,cost=0,pricedCost=0,pricedValue=0,unpriced=0,noCost=0,cards=0,realized=0,realizedCost=0,proceeds=0,sold=0;
 const rows=entries.map(e=>{
  const qty=e.quantity||1;
  if(e.sold_price!=null){
   const c=e.purchase_price!=null?e.purchase_price*qty:null,got=e.sold_price*qty,pl=c!=null?got-c:null;sold++;proceeds+=got;
   if(pl!=null){realized+=pl;realizedCost+=c;}
   return {...e,sold:true,unit:e.sold_price,value:null,proceeds:got,cost:c,pl,plPct:pl!=null&&c>0?pl/c:null,basis:'sold'};
  }
  const v=entryValue(e,marketFor(e.card_id),now);cards+=qty;
  if(v.value!=null)value+=v.value;else unpriced++;
  if(v.cost!=null)cost+=v.cost;else noCost++;
  if(v.value!=null&&v.cost!=null){pricedValue+=v.value;pricedCost+=v.cost;}
  return {...e,...v};});
 const pl=pricedValue-pricedCost;
 return {rows,value,cost,pl,plPct:pricedCost>0?pl/pricedCost:null,cards,entries:entries.length-sold,unpriced,noCost,comparedCost:pricedCost,comparedValue:pricedValue,
  sold,proceeds,realized,realizedCost,realizedPct:realizedCost>0?realized/realizedCost:null};
}

// Month-by-month value of the cards held at that time against what was paid for them.
// Entries without a purchase date are counted from their first available price month.
export function portfolioSeries(entries,marketFor,now=Date.now()){
 const nowYm=new Date(now).toISOString().slice(0,7);
 const items=entries.map(e=>{const market=marketFor(e.card_id),history=priceHistory(market,e.grade),current=entryValue(e,market,now);
  const start=e.purchase_date?month(e.purchase_date):history[0]?.[0]||nowYm;return {e,history,current,start};});
 if(!items.length)return [];
 let first=items.map(i=>i.start).sort()[0];
 const span=(Number(nowYm.slice(0,4))*12+Number(nowYm.slice(5)))-(Number(first.slice(0,4))*12+Number(first.slice(5)));
 if(span>120)first=addMonths(nowYm,-120);
 const points=[];
 for(let ym=first;ym<=nowYm;ym=addMonths(ym,1)){
  let value=0,cost=0,held=0,estimated=0;
  for(const i of items){if(i.start>ym)continue;const qty=i.e.quantity||1,soldYm=i.e.sold_date?month(i.e.sold_date):null;if(soldYm&&ym>soldYm)continue;held+=qty;
   let unit=soldYm===ym?i.e.sold_price:ym===nowYm?i.current.unit:valueAt(i.history,ym);
   if(unit==null){unit=i.e.purchase_price??i.current.unit;estimated++;}
   if(unit!=null)value+=unit*qty;if(i.e.purchase_price!=null)cost+=i.e.purchase_price*qty;}
  points.push({month:ym,value:Math.round(value*100)/100,cost:Math.round(cost*100)/100,held,estimated});
 }
 return points;
}

// ---------- Analytics (held entries) ----------
// `rows` are summarize() rows; `meta` maps a card id to {lang, series, set, setName, tier, chars:[...]};
// `metrics` maps "card|grade" to its card_metrics row (beta, volatility, sales_90d, ...).
const held=rows=>rows.filter(r=>!r.sold&&r.value>0);
// Value by group, largest first. A card with several Pokémon (a TAG TEAM) splits its value between them.
export function allocation(rows,meta,dim){
 const out=new Map();let total=0;
 for(const r of held(rows)){
  const m=meta[r.card_id]||{};total+=r.value;
  const keys=dim==='grade'?[r.grade]:dim==='char'?(m.chars?.length?m.chars:['Other']):[m[dim]??'Other'];
  for(const k of keys)out.set(k,(out.get(k)||0)+r.value/keys.length);
 }
 return [...out].map(([key,value])=>({key,value,share:total>0?value/total:0})).sort((a,b)=>b.value-a.value);
}
export function concentration(rows,meta,metrics){
 const h=held(rows),total=h.reduce((n,r)=>n+r.value,0);if(!total)return null;
 const w=h.map(r=>r.value/total).sort((a,b)=>b-a),top=h.reduce((a,b)=>b.value>a.value?b:a);
 let beta=0,betaW=0,vol=0,volW=0,illiquid=0;
 for(const r of h){const x=metrics[r.card_id+'|'+r.grade];if(x?.beta!=null){beta+=x.beta*r.value;betaW+=r.value;}if(x?.volatility!=null){vol+=x.volatility*r.value;volW+=r.value;}if(!(x?.sales_90d>0))illiquid+=r.value;}
 const char=allocation(rows,meta,'char').filter(a=>a.key!=='Other')[0],set=allocation(rows,meta,'setName')[0];
 return {total,holdings:h.length,top:{card_id:top.card_id,grade:top.grade,share:top.value/total},top5:w.slice(0,5).reduce((a,b)=>a+b,0),
  effective:1/w.reduce((n,x)=>n+x*x,0),char:char||null,set:set||null,beta:betaW?beta/betaW:null,betaCovered:betaW/total,volatility:volW?vol/volW:null,illiquid:illiquid/total};
}
// Value after a group moves by `move` (0.1 = +10%), or the whole market with each card scaled by its beta
// (1 where unknown).
export function whatIf(rows,meta,metrics,{dim,key,move}){
 let before=0,after=0,affected=0;
 for(const r of held(rows)){
  const m=meta[r.card_id]||{};before+=r.value;let d=0;
  if(dim==='market')d=move*(metrics[r.card_id+'|'+r.grade]?.beta??1);
  else{const keys=dim==='grade'?[r.grade]:dim==='char'?(m.chars||[]):[m[dim]];const share=keys.filter(k=>k===key).length/(keys.length||1);d=move*share;if(share>0)affected+=r.value;}
  after+=r.value*(1+Math.max(-1,d));
 }
 return {before,after,change:after-before,changePct:before>0?after/before-1:null,affected};
}
// The cards held now, at fixed quantities, month by month from their monthly guide (rebased to 100 at the
// first month every card has a price), against a benchmark built from the same starting weights: each card
// moving like its language and grade's market index (`levels` maps "lang|grade" to [[month, level]]).
export function versusMarket(rows,meta,marketFor,levels,months){
 const h=held(rows),hist=h.map(r=>({r,h:priceHistory(marketFor(r.card_id),r.grade),idx:new Map(levels[(meta[r.card_id]?.lang||'en')+'|'+r.grade]||[])}));
 if(!h.length||months.length<2)return null;
 const start=months.find(ym=>hist.every(x=>valueAt(x.h,ym)!=null&&x.idx.get(ym)>0));if(!start)return null;
 const base=hist.map(x=>({...x,v0:valueAt(x.h,start)*(x.r.quantity||1),i0:x.idx.get(start)}));const total0=base.reduce((n,x)=>n+x.v0,0);
 const points=[];
 for(const ym of months.filter(m=>m>=start)){
  let mine=0,bench=0,ok=true;
  for(const x of base){const v=valueAt(x.h,ym),i=x.idx.get(ym);if(v==null||!(i>0)){ok=false;break;}mine+=v*(x.r.quantity||1);bench+=x.v0*i/x.i0;}
  if(ok)points.push([ym,mine/total0*100,bench/total0*100]);
 }
 return points.length>=2?{start,points,mine:points.at(-1)[1]/100-1,market:points.at(-1)[2]/100-1}:null;
}
