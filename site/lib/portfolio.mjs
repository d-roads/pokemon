// The Dex: what a collection is worth, what it cost, and how that changed over time.
// Shared by the server and the browser (served at /portfolio.mjs).
import {analyze} from './analysis.mjs';

export const HISTORY_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
const month=d=>String(d).slice(0,7);
const addMonths=(ym,n)=>{const [y,m]=ym.split('-').map(Number),t=y*12+m-1+n;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0');};

export function validateEntry(input,{cards,today=new Date().toISOString().slice(0,10)}){
 const e=input&&typeof input==='object'?input:{},errors=[];
 if(!cards.some(c=>c.id===e.card_id))errors.push('Choose a card from the catalog.');
 if(!['raw','psa9','psa10'].includes(e.grade))errors.push('Choose Raw, PSA 9, or PSA 10.');
 const quantity=e.quantity==null||e.quantity===''?1:Number(e.quantity);
 if(!Number.isInteger(quantity)||quantity<1||quantity>999)errors.push('Quantity must be a whole number from 1 to 999.');
 const price=e.purchase_price==null||e.purchase_price===''?null:Number(e.purchase_price);
 if(price!=null&&(!Number.isFinite(price)||price<0||price>1000000))errors.push('Enter a price paid between $0 and $1,000,000, or leave it blank.');
 const date=e.purchase_date?String(e.purchase_date):null;
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today||date<'1996-01-01'))errors.push('Enter a purchase date that is not in the future.');
 const notes=e.notes==null?'':String(e.notes).trim().slice(0,280);
 return {errors,entry:{card_id:e.card_id,grade:e.grade,quantity,purchase_price:price==null?null:Math.round(price*100)/100,purchase_date:date,notes}};
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

export function summarize(entries,marketFor,now=Date.now()){
 let value=0,cost=0,pricedCost=0,pricedValue=0,unpriced=0,noCost=0,cards=0;
 const rows=entries.map(e=>{const v=entryValue(e,marketFor(e.card_id),now);cards+=e.quantity||1;
  if(v.value!=null)value+=v.value;else unpriced++;
  if(v.cost!=null)cost+=v.cost;else noCost++;
  if(v.value!=null&&v.cost!=null){pricedValue+=v.value;pricedCost+=v.cost;}
  return {...e,...v};});
 const pl=pricedValue-pricedCost;
 return {rows,value,cost,pl,plPct:pricedCost>0?pl/pricedCost:null,cards,entries:entries.length,unpriced,noCost,comparedCost:pricedCost,comparedValue:pricedValue};
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
  for(const i of items){if(i.start>ym)continue;const qty=i.e.quantity||1;held+=qty;
   let unit=ym===nowYm?i.current.unit:valueAt(i.history,ym);
   if(unit==null){unit=i.e.purchase_price??i.current.unit;estimated++;}
   if(unit!=null)value+=unit*qty;if(i.e.purchase_price!=null)cost+=i.e.purchase_price*qty;}
  points.push({month:ym,value:Math.round(value*100)/100,cost:Math.round(cost*100)/100,held,estimated});
 }
 return points;
}
