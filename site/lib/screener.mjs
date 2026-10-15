// Screener: filter and sort every card of a language and grade on its market metrics (card_metrics), its
// lead Pokémon's demand and index return, and its set's age and index return.
//
// A screen is {lang, grade, filters: {field: [min, max]}, eras: [...], tiers: [...], query, sort: {field, dir}}.
// Bounds are in the field's own units: returns and shares as fractions (0.1 = 10%), multiples as ×, prices in
// dollars, counts and months as numbers. The page converts percentages before sending.
import {tierOf,charactersOfCard,TIER_LABEL} from './metrics.mjs';

// [key, label, kind]; kind tells the page how to show and enter it: money, ret (a change), pct (a share),
// x (a multiple), int, num. ret and pct are fractions, entered on the page as percent.
export const SCREEN_FIELDS=[
 ['price','Price','money'],['sold','Sold median','money'],
 ['ret_7d','7D','ret'],['ret_30d','30D','ret'],['ret_90d','90D','ret'],['ret_1y','1Y','ret'],
 ['from_high','From 52-week high','ret'],['drawdown','From peak','ret'],['volatility','Volatility','pct'],
 ['sales_30d','Sales 30D','int'],['sales_90d','Sales 90D','int'],['days_since_sale','Days since sale','int'],
 ['spread_10_9','PSA 10 / PSA 9','x'],['spread_10_raw','PSA 10 / raw','x'],
 ['pop_total','PSA graded','int'],['pop_10','PSA 10 population','int'],['gem_rate','Gem rate','pct'],['pop_growth_90d','Population growth 90D','ret'],
 ['lang_gap','Other-language price gap','ret'],['premium','vs peers','x'],['beta','Beta to era','num'],['correl','Correlation to era','num'],
 ['char_premium','Pokémon demand','x'],['char_demand_1y','Pokémon demand change 1Y','ret'],['char_ret_1y','Pokémon index 1Y','ret'],
 ['set_age','Set age (months)','int'],['set_ret_1y','Set index 1Y','ret'],
];
const FIELD=new Map(SCREEN_FIELDS.map(f=>[f[0],f]));
export const SCREEN_LIMITS={rows:500,export:20000,filters:20,name:60,saved:50};

// Check a screen sent by the page. Returns {screen, errors}.
export function normalizeScreen(input,{eraIds=[]}={}){
 const s=input&&typeof input==='object'&&!Array.isArray(input)?input:{},errors=[];
 const lang=s.lang==='ja'?'ja':'en',grade=['raw','psa9','psa10'].includes(s.grade)?s.grade:'psa10';
 const filters={};
 const raw=s.filters&&typeof s.filters==='object'&&!Array.isArray(s.filters)?s.filters:{};
 if(Object.keys(raw).length>SCREEN_LIMITS.filters)errors.push('Use at most '+SCREEN_LIMITS.filters+' filters.');
 for(const [k,v] of Object.entries(raw)){
  if(!FIELD.has(k)){errors.push('Unknown filter: '+k+'.');continue;}
  if(!Array.isArray(v)||v.length!==2){errors.push('Each filter needs a minimum and a maximum (either may be blank).');continue;}
  const [lo,hi]=v.map(x=>x==null||x===''?null:Number(x));
  if([lo,hi].some(x=>x!=null&&!Number.isFinite(x))){errors.push('Filter values must be numbers.');continue;}
  if(lo==null&&hi==null)continue;
  filters[k]=lo!=null&&hi!=null&&lo>hi?[hi,lo]:[lo,hi];
 }
 const eras=Array.isArray(s.eras)?s.eras.filter(e=>eraIds.includes(e)):[];
 const tiers=Array.isArray(s.tiers)?s.tiers.filter(t=>t in TIER_LABEL):[];
 const query=typeof s.query==='string'?s.query.trim().toLowerCase().slice(0,80):'';
 const sortField=FIELD.has(s.sort?.field)?s.sort.field:'price',dir=s.sort?.dir===1?1:-1;
 return {screen:{lang,grade,filters,eras,tiers,query,sort:{field:sortField,dir}},errors};
}

// Rows for every card of the screen's language and grade, with every field. `metrics` are its card_metrics
// rows, `chars` and `setRows` index_metrics rows (kind char / set) for the same language and grade.
export function screenRows(screen,{cards,sets,metrics,chars,setRows,today=Date.now()}){
 const byId=new Map(cards.map(c=>[c.id,c])),charBy=new Map(chars.map(r=>[r.key,r])),setBy=new Map(setRows.map(r=>[r.key,r])),setInfo=new Map(sets.map(s=>[s.id,s]));
 const eq=(r,k)=>r?.['eq_'+k]??r?.[k]??null;
 const out=[];
 for(const m of metrics){
  const card=byId.get(m.card_id);if(!card)continue;
  let lead=null;for(const n of charactersOfCard(card)){const r=charBy.get(n);if(r&&(!lead||r.premium>lead.premium))lead=r;}
  const set=setInfo.get(card.setId),sr=setBy.get(card.setId);
  const age=set?.release?Math.max(0,Math.round((today-Date.parse(set.release+'T00:00:00Z'))/2629800000)):null;
  out.push({...m,from_high:m.price>0&&m.high_52w>0?m.price/m.high_52w-1:null,
   char:lead?.key??null,char_premium:lead?.premium??null,char_demand_1y:lead?.premium&&lead?.premium_1y?lead.premium/lead.premium_1y-1:null,char_ret_1y:eq(lead,'ret_1y'),
   set_age:age,set_ret_1y:eq(sr,'ret_1y'),series:card.series,tier:tierOf(card)});
 }
 return out;
}

// Apply the screen's filters and sort. Cards missing a filtered field are left out.
export function runScreen(screen,rows,{cards}){
 const byId=new Map(cards.map(c=>[c.id,c])),f=Object.entries(screen.filters),eras=new Set(screen.eras),tiers=new Set(screen.tiers),q=screen.query;
 const hit=rows.filter(r=>{
  if(eras.size&&!eras.has(r.series))return false;
  if(tiers.size&&!tiers.has(r.tier))return false;
  if(q){const c=byId.get(r.card_id);if(!c||!(c.name+' '+(c.nameJa||'')+' '+c.numberLabel+' '+c.setName+' '+c.setId).toLowerCase().includes(q))return false;}
  for(const [k,[lo,hi]] of f){const v=r[k];if(v==null||!Number.isFinite(v))return false;if(lo!=null&&v<lo)return false;if(hi!=null&&v>hi)return false;}
  return true;
 });
 const {field,dir}=screen.sort;
 hit.sort((a,b)=>{const x=a[field],y=b[field];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x-y)*dir;});
 return hit;
}
