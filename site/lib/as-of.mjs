// As-of layer: what the app could have known at a cutoff.
//
// Two cutoffs apply to every value:
//   event_at      when the sale happened or the month the guide describes
//   available_at  when this app first held the value (its capture time)
// Strict mode enforces both. A record captured after the cutoff is unavailable, however old its
// sales are, and a current snapshot is never relabelled as historical by changing its check date.
//
// Reconstruction mode exists only for research on archives that predate observation logging.
// It applies the event cutoff alone, removes values that only describe the capture moment
// (current guides, population counts) and marks the result `reconstructed`, so it can never be
// mistaken for a historically available input.
const asOfMonthEnd=ym=>{const [y,m]=ym.split('-').map(Number);return Date.UTC(y,m,0,23,59,59);};
export const AS_OF_MODES=['strict','reconstruction'];

export function capturedAt(market){const t=market?.research?.checkedAt||market?.observedAt;return t&&Number.isFinite(Date.parse(t))?t:null;}

export function asOfMarket(market,cutoff,{mode='strict'}={}){
 if(!AS_OF_MODES.includes(mode))throw new Error('Unknown as-of mode.');
 const at=typeof cutoff==='number'?cutoff:Date.parse(cutoff);
 if(!Number.isFinite(at))throw new Error('An as-of cutoff date is required.');
 const iso=new Date(at).toISOString(),day=iso.slice(0,10);
 if(!market)return {market:null,status:'missing',reason:'No market record.'};
 const captured=capturedAt(market);
 if(mode==='strict'&&(!captured||Date.parse(captured)>at))return {market:null,status:'unavailable',reason:captured?`First captured ${captured.slice(0,10)}, after the ${day} cutoff.`:'Capture time unknown, so it cannot be shown as available.'};
 const sales=(market.sales||[]).filter(s=>typeof s.date==='string'&&s.date<=day);
 // A monthly guide value is known only once its month has ended.
 const history={};for(const [k,points] of Object.entries(market.history||{}))history[k]=(points||[]).filter(([ym])=>/^\d{4}-\d{2}$/.test(ym)&&asOfMonthEnd(ym)<=at);
 if(mode==='reconstruction'){
  const {guide,guideSources,pop,research,...rest}=market;
  return {status:'reconstructed',market:{...rest,guide:{},guideSources:{},pop:null,sales,history,observedAt:iso,
   research:research?{status:research.status,cutoff:research.cutoff,coverage:research.coverage}:undefined,
   asOf:{mode,cutoff:iso,reconstructed:true,note:'Event-date filter only; current guides and population removed. Not historically available data.'}}};
 }
 const guide={},guideSources={};
 for(const [k,v] of Object.entries(market.guide||{})){const seen=market.guideSources?.[k]?.observedAt||captured;if(Date.parse(seen)<=at){guide[k]=v;if(market.guideSources?.[k])guideSources[k]=market.guideSources[k];}}
 return {status:'available',market:{...market,guide,guideSources,sales,history,asOf:{mode,cutoff:iso,reconstructed:false}}};
}

// Observation rows (see observations.mjs): keep rows whose event and availability are both at or
// before the cutoff, and the newest recorded version per key.
export function asOfObservations(rows,cutoff,key=r=>[r.card_id,r.grade??r.guide??r.grader,r.listing_id??r.period??''].join('|')){
 const at=typeof cutoff==='number'?cutoff:Date.parse(cutoff);if(!Number.isFinite(at))throw new Error('An as-of cutoff date is required.');
 const latest=new Map();
 for(const r of rows||[]){
  if(!r.available_at||Date.parse(r.available_at)>at)continue;
  if(r.event_at&&Date.parse(r.event_at.length===10?r.event_at+'T00:00:00Z':r.event_at)>at)continue;
  const k=key(r),prev=latest.get(k);
  if(!prev||String(r.available_at)>String(prev.available_at)||(r.available_at===prev.available_at&&(r.id??0)>(prev.id??0)))latest.set(k,r);
 }
 return [...latest.values()];
}
