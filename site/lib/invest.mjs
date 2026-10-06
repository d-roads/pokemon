// Potential investments: cards whose own sales history shows a reason to look closer.
//
// Three signals, each computed only from the app's sales, monthly guide history and catalog:
//   uptrend     a steady, statistically clear rise over the past year, not one spike
//   recovering  well below a sustained multi-year high, with recent sales turning up
//   cheap       priced well below same-rarity cards of less in-demand characters from the same set
// Every card must also have a confident current price (the same evidence a buy target needs),
// be worth at least $25, and feature a character with above-median collector demand, measured
// from how that character's other cards sell. Anything that can't be measured is left out.
import {analyze,median} from './analysis.mjs';

const INV_DAY=86400000,INV_YEAR=365.2425;
export const INVEST_GRADES=['psa10','psa9','raw'];
export const INVEST_RULES={
 minPrice:25,demandShare:.25,shrink:3,limit:20,staleDays:14,
 uptrend:{minSales:8,minSpanDays:180,minQuarters:3,minGrowth:.15,maxGrowth:1.5,minT:3,maxScatter:.25,confirm:1.1},
 recovering:{minMonths:24,lookbackMonths:60,skipMonths:3,minDrawdown:.4,sustainShare:.8,sustainMonths:3,minDistinct:4,recentDays:45,priorDays:90,minSales:3,minRise:.05},
 cheap:{maxRatio:.65,minPeers:4,demandGap:10},
 perCharacter:3,
};
const INV_HISTORY_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
const invDayOf=iso=>Math.floor(Date.parse(iso)/INV_DAY);
const invChecked=m=>m?.research?.checkedAt||m?.observedAt||null;

// ---------- Characters and demand ----------
const FORM_PREFIX=/^(?:M|Mega|Primal|Shining|Dark|Light|Alolan|Detective|Flying|Surfing|Ash|(?:Brock|Misty|Lt\. Surge|Erika|Sabrina|Koga|Blaine|Giovanni|Rocket)'s|Imakuni\?'s|Team (?:Aqua|Magma)'s)\s+/i;
// The Pokémon (or trainer) a card is about. Tag Team cards return each partner.
export function charactersOf(name){
 return String(name).split(/\s+&\s+/).map(part=>{
  let n=part.trim().replace(/\s*[◇★☆δ]$/i,'').replace(/[\s-]+(?:ex|gx|break|legend|lv\.?x)$/i,'').trim();
  for(let i=0;i<3&&FORM_PREFIX.test(n);i++)n=n.replace(FORM_PREFIX,'');
  n=n.replace(/^(?:Black|White)\s+(?=Kyurem)/,'').replace(/^(?:Dawn Wings|Dusk Mane|Ultra)\s+(?=Necrozma)/,'').replace(/^(?:Heat|Wash|Frost|Fan|Mow)\s+(?=Rotom)/,'').replace(/^Ho Oh$/,'Ho-Oh');
  return n.replace(/[\s-]+(?:ex|gx|break|legend|lv\.?x)$/i,'').trim();
 }).filter(Boolean);
}
const pctRank=(values)=>{const sorted=[...values].sort((a,b)=>a-b);return v=>{if(sorted.length<2)return .5;let lo=0;while(lo<sorted.length&&sorted[lo]<v)lo++;let hi=lo;while(hi<sorted.length&&sorted[hi]===v)hi++;return ((lo+hi-1)/2)/(sorted.length-1);};};
const peerKey=c=>c.series+'|'+c.category;

// Price context for every card: each grade's reference price relative to its peers
// (same era and rarity category), and how often the card sells.
export function marketContext(entries,{now=Date.now(),rules=INVEST_RULES}={}){
 const today=Math.floor(now/INV_DAY),stamps=entries.map(([,m])=>invChecked(m)).filter(s=>s&&Number.isFinite(Date.parse(s))).sort();
 const newest=stamps.length?Math.min(invDayOf(stamps.at(-1)),today):today;
 const rows=[];
 for(const [card,market] of entries){
  if(!card.eligible||!market)continue;
  const checked=invChecked(market),endDay=checked?Math.min(invDayOf(checked),today):today,end=endDay*INV_DAY+INV_DAY-1;
  const analyses=Object.fromEntries(INVEST_GRADES.map(g=>[g,analyze(market,g,15,end)]));
  const activity=market.research?.status==='full'?(market.sales||[]).filter(s=>s.price>0&&endDay-invDayOf(s.date)>=0&&endDay-invDayOf(s.date)<180).length:null;
  rows.push({card,market,endDay,end,stale:!checked||!Number.isFinite(endDay)||today-endDay>rules.staleDays,analyses,activity,characters:charactersOf(card.name)});
 }
 // Peer medians per grade, by era + category, falling back to category alone for small groups.
 const peers={};
 for(const g of INVEST_GRADES){
  const groups=new Map(),wide=new Map();
  for(const r of rows){const p=r.analyses[g].current;if(r.stale||!(p>0))continue;const k=peerKey(r.card);(groups.get(k)||groups.set(k,[]).get(k)).push(p);(wide.get(r.card.category)||wide.set(r.card.category,[]).get(r.card.category)).push(p);}
  peers[g]=card=>{const a=groups.get(peerKey(card));if(a?.length>=rules.cheap.minPeers)return {median:median(a),size:a.length,scope:'era'};const b=wide.get(card.category);return b?.length>=rules.cheap.minPeers?{median:median(b),size:b.length,scope:'all'}:null;};
 }
 for(const r of rows){
  const logs=INVEST_GRADES.map(g=>{const p=r.analyses[g].current,peer=peers[g](r.card);return !r.stale&&p>0&&peer?Math.log(p/peer.median):null;}).filter(v=>v!=null);
  r.premium=logs.length?logs.reduce((a,b)=>a+b,0)/logs.length:null;
 }
 // Character demand: how far above their peers a character's cards sell, and how often.
 // Premiums are averaged and shrunk toward zero (as if `shrink` extra average cards existed),
 // so a character seen on only two or three cards can't top the list by luck.
 const byCharacter=new Map();
 for(const r of rows)for(const name of r.characters)(byCharacter.get(name)||byCharacter.set(name,[]).get(name)).push(r);
 const characters=new Map();
 for(const [name,list] of byCharacter){
  const premiums=list.map(r=>r.premium).filter(v=>v!=null),acts=list.filter(r=>!r.stale).map(r=>r.activity).filter(v=>v!=null);
  if(premiums.length<2)continue;
  const sum=premiums.reduce((a,b)=>a+b,0);
  characters.set(name,{name,cards:list.length,priced:premiums.length,sum,premium:sum/(premiums.length+rules.shrink),activity:acts.length?median(acts):null});
 }
 const premRank=pctRank([...characters.values()].map(c=>c.premium)),actRank=pctRank([...characters.values()].filter(c=>c.activity!=null).map(c=>c.activity));
 for(const c of characters.values())c.score=Math.round(100*(c.activity!=null?.65*premRank(c.premium)+.35*actRank(c.activity):premRank(c.premium)));
 // Only characters in the top quarter by demand are treated as safe enough to recommend.
 const scores=[...characters.values()].map(c=>c.score).sort((a,b)=>b-a);
 const demandCut=scores.length?scores[Math.max(0,Math.ceil(scores.length*rules.demandShare)-1)]:Infinity;
 const bySet=new Map();for(const r of rows)(bySet.get(r.card.setId)||bySet.set(r.card.setId,[]).get(r.card.setId)).push(r);
 return {rows,peers,characters,newest,demandCut,rules,bySet};
}
export function demandOf(ctx,row){
 const known=row.characters.map(n=>ctx.characters.get(n)).filter(Boolean);
 if(!known.length)return null;
 return known.sort((a,b)=>b.score-a.score)[0];
}

// ---------- Signals ----------
export function uptrendSignal(a,endDay,rules=INVEST_RULES.uptrend){
 const year=a.comparable.filter(s=>endDay-invDayOf(s.date)>=0&&endDay-invDayOf(s.date)<365);
 const mid=median(year.map(s=>s.price));if(mid==null)return null;
 const rows=year.filter(s=>s.price>=mid*.4&&s.price<=mid*2.5);
 if(rows.length<rules.minSales)return null;
 const ages=rows.map(s=>endDay-invDayOf(s.date)),span=Math.max(...ages)-Math.min(...ages);
 if(span<rules.minSpanDays||new Set(ages.map(x=>Math.floor(x/91.3))).size<rules.minQuarters)return null;
 const pts=rows.map((s,i)=>({x:-ages[i]/INV_YEAR,y:Math.log(s.price)})),n=pts.length;
 const mx=pts.reduce((t,p)=>t+p.x,0)/n,my=pts.reduce((t,p)=>t+p.y,0)/n,sxx=pts.reduce((t,p)=>t+(p.x-mx)**2,0);
 if(!sxx)return null;
 const slope=pts.reduce((t,p)=>t+(p.x-mx)*(p.y-my),0)/sxx,resid=pts.map(p=>p.y-(my+slope*(p.x-mx)));
 const se=Math.sqrt(resid.reduce((t,r)=>t+r*r,0)/(n-2)/sxx),tStat=se>0?slope/se:Infinity,growth=Math.exp(slope)-1,scatter=median(resid.map(Math.abs));
 if(growth<rules.minGrowth||growth>rules.maxGrowth||tStat<rules.minT||scatter>rules.maxScatter)return null;
 const recent=rows.filter((s,i)=>ages[i]<90).map(s=>s.price),old=rows.filter((s,i)=>ages[i]>=180).map(s=>s.price);
 if(recent.length<2||old.length<2||median(recent)<median(old)*rules.confirm)return null;
 return {type:'uptrend',growth,sales:n,months:Math.round(span/30.44),then:median(old),now:median(recent)};
}
export function recoveringSignal(a,history,endDay,rules=INVEST_RULES.recovering){
 const h=(history||[]).map(([ym,cents])=>[ym,cents/100]).filter(([,v])=>v>0);
 if(h.length<rules.minMonths)return null;
 const window=h.slice(-rules.lookbackMonths),candidates=window.slice(0,-rules.skipMonths);if(!candidates.length)return null;
 let peakIdx=0;candidates.forEach(([,v],i)=>{if(v>candidates[peakIdx][1])peakIdx=i;});
 const [peakMonth,peak]=candidates[peakIdx],latest=h.at(-1)[1],drawdown=1-latest/peak;
 if(drawdown<rules.minDrawdown||!(a.fair<=peak))return null;
 // The high has to be a real, held price, not a one-month blip or a stale placeholder.
 if(window.filter(([,v])=>v>=peak*rules.sustainShare).length<rules.sustainMonths)return null;
 if(new Set(window.slice(Math.max(0,peakIdx-6),peakIdx+7).map(([,v])=>v)).size<rules.minDistinct)return null;
 // Recent sales must be turning up.
 const age=s=>endDay-invDayOf(s.date),clean=list=>{const m=median(list.map(s=>s.price));return m==null?[]:list.filter(s=>s.price>=m*.4&&s.price<=m*2.5);};
 const recent=clean(a.comparable.filter(s=>age(s)>=0&&age(s)<rules.recentDays)),prior=clean(a.comparable.filter(s=>age(s)>=rules.recentDays&&age(s)<rules.recentDays+rules.priorDays));
 if(recent.length<rules.minSales||prior.length<rules.minSales)return null;
 const before=median(prior.map(s=>s.price)),after=median(recent.map(s=>s.price)),rise=after/before-1;
 if(rise<rules.minRise||recent.filter(s=>s.price>before).length/recent.length<.6)return null;
 return {type:'recovering',peak,peakMonth,latest,drawdown,rise,before,after,recentSales:recent.length};
}
// Cheaper than cards that should be cheaper: same set, rarity category and grade, featuring
// characters with clearly lower demand. Other sets are not used: print runs differ too much.
// Promos are skipped too: they come from too many different products to compare fairly.
export function cheapSignal(ctx,row,grade,demand,rules=INVEST_RULES.cheap){
 const a=row.analyses[grade];if(!(a.fair>0)||row.card.category==='Promo')return null;
 const lower=r=>{if(r===row||r.card.category!==row.card.category||r.stale)return null;const p=r.analyses[grade].current,d=demandOf(ctx,r);return p>0&&d&&d.score<=demand.score-rules.demandGap?p:null;};
 const prices=(ctx.bySet.get(row.card.setId)||[]).map(lower).filter(v=>v!=null);
 if(prices.length<rules.minPeers)return null;
 const typical=median(prices),ratio=a.fair/typical;
 if(ratio>rules.maxRatio)return null;
 return {type:'cheap',ratio,typical,peers:prices.length,category:row.card.category,setName:row.card.setName};
}

// ---------- Thesis ----------
// A short, plain-language case for each pick, written only from the numbers behind it.
const INV_GRADE_NAME={raw:'raw near-mint',psa9:'PSA 9',psa10:'PSA 10'};
const invMoney=v=>'$'+(v>=100?Math.round(v).toLocaleString('en-US'):v.toFixed(2));
const invPct=v=>Math.round(v*100)+'%';
const invMonth=ym=>{const [y,m]=ym.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]+' '+y;};
export const SIGNAL_TYPES=[['uptrend','Steady uptrend'],['recovering','Recovering from highs'],['cheap','Cheap vs. similar cards']];
export function investmentThesis(card,pick){
 const d=pick.demand,grade=INV_GRADE_NAME[pick.grade],by=Object.fromEntries(pick.signals.map(s=>[s.type,s]));
 const tier=d.score>=90?'one of the most sought-after characters in these eras':d.score>=80?'a highly sought-after character':'a character in the top quarter for collector demand';
 const parts=[`${d.character} is ${tier} (${d.score}/100): its cards typically sell for about ${d.premium.toFixed(1)}× comparable cards.`];
 if(by.uptrend){const u=by.uptrend;parts.push(`This ${grade} copy has climbed about ${invPct(u.growth)} a year across ${u.sales} sales over ${u.months} months, from a ${invMoney(u.then)} median 6+ months ago to ${invMoney(u.now)} recently, with little scatter between sales.`);}
 if(by.recovering){const r=by.recovering;parts.push(`It is still ${invPct(r.drawdown)} below its ${invMonth(r.peakMonth)} monthly-guide high of ${invMoney(r.peak)}, but the last 45 days of sales are up ${invPct(r.rise)} (${invMoney(r.before)} → ${invMoney(r.after)}), so buyers may be returning.`);}
 if(by.cheap){const c=by.cheap;parts.push(`At ${invMoney(pick.price)} it sells for ${invPct(1-c.ratio)} less than the ${invMoney(c.typical)} median of ${c.peers} ${c.category.toLowerCase()} cards of less popular characters in ${c.setName}.`);}
 const risk=by.uptrend&&!by.recovering&&!by.cheap?'The case rests on momentum: a run can stall, and buying after a rise means paying today\'s higher price.':by.cheap&&!by.uptrend?'Cheap can stay cheap if collectors prefer the other cards in the set.':by.recovering?'A recovery can stall well short of the old high.':'Signals describe past sales only.';
 parts.push(risk+' Not a forecast or investment advice.');
 return parts.join(' ');
}

export function potentialInvestments(entries,{now=Date.now(),rules=INVEST_RULES}={}){
 const ctx=marketContext(entries,{now,rules}),grades={};
 for(const grade of INVEST_GRADES){
  const picks=[];let screened=0;
  for(const row of ctx.rows){
   const a=row.analyses[grade];
   if(row.stale||!(a.fair>=rules.minPrice))continue;
   const demand=demandOf(ctx,row);if(!demand||demand.score<ctx.demandCut)continue;
   screened++;
   const signals=[uptrendSignal(a,row.endDay,rules.uptrend),recoveringSignal(a,row.market.history?.[INV_HISTORY_KEY[grade]],row.endDay,rules.recovering),cheapSignal(ctx,row,grade,demand,rules.cheap)].filter(Boolean);
   if(!signals.length)continue;
   const pick={card_id:row.card.id,grade,price:a.fair,priceLabel:a.priceLabel,sales:a.sampleCount,signals,
    checks:SIGNAL_TYPES.map(([type,label])=>({type,label,hit:signals.some(s=>s.type===type)})),
    demand:{character:demand.name,score:demand.score,premium:Math.exp(demand.premium),activity:demand.activity,cards:demand.cards}};
   pick.thesis=investmentThesis(row.card,pick);
   picks.push(pick);
  }
  picks.sort((x,y)=>y.signals.length-x.signals.length||y.demand.score-x.demand.score||y.sales-x.sales||x.card_id.localeCompare(y.card_id));
  // Keep the list varied: at most a few cards per character.
  const perCharacter=new Map(),shown=[];
  for(const p of picks){const n=perCharacter.get(p.demand.character)||0;if(n>=rules.perCharacter)continue;perCharacter.set(p.demand.character,n+1);shown.push(p);if(shown.length>=rules.limit)break;}
  grades[grade]={picks:shown,qualified:picks.length,screened};
 }
 const stamps=ctx.rows.map(r=>invChecked(r.market)).filter(Boolean).sort();
 return {checkedAt:stamps.at(-1)||null,rules:{minPrice:rules.minPrice,demandCut:ctx.demandCut,demandShare:rules.demandShare,maxGrowth:rules.uptrend.maxGrowth,minGrowth:rules.uptrend.minGrowth},characters:ctx.characters.size,grades};
}
