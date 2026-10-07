// Investment research in the app: evidence, research rank, costs and (only when validated) a
// forecast, kept separate from the existing heuristic score.
//
// FUTURESIGHT_SCORE_MODEL chooses what the app shows (the rollback switch):
//   legacy     the existing heuristic score only
//   shadow     (default) heuristic score, plus the research rank, evidence status and cost
//              calculator. The trained forecast is computed and archived, never shown.
//   candidate  also shows the forecast and maximum buy price, but only if the frozen model
//              artifact passed its promotion gate; otherwise the app falls back to shadow.
// Nothing here trains or reweights anything. Probabilities of profit are never shown: none
// has been calibrated.
import {researchTable,REASONS,RESEARCH_RANK} from './investment-features.mjs';
import {DEFAULT_COSTS,costSummary,maxBuyPrice,netReturn,COST_PROFILE_VERSION} from './investment-costs.mjs';
import {modelForecast} from './investment-model.mjs';
import investmentArtifact from '../data/investment-model.json' with {type:'json'};

export const SCORE_MODES=['legacy','shadow','candidate'];
export const MODEL_ARTIFACT=investmentArtifact;
// Languages the research rank is shown for. Japanese cards are ranked only against Japanese cards and
// stay off unless FUTURESIGHT_JA_RESEARCH=shadow: the frozen English rank did not pass its
// Japanese out-of-sample check (tools/research/investment-backtest-ja-results.json).
export function researchLanguages(env){return String(env?.FUTURESIGHT_JA_RESEARCH||'off').trim().toLowerCase()==='shadow'?['en','ja']:['en'];}
export function scoreMode(env,artifact=investmentArtifact){
 const asked=String(env?.FUTURESIGHT_SCORE_MODEL||'shadow').trim().toLowerCase();
 const mode=SCORE_MODES.includes(asked)?asked:'shadow';
 return mode==='candidate'&&!artifact?.promoted?'shadow':mode;
}
export const modelVersion=(artifact=investmentArtifact)=>RESEARCH_RANK.version+'+'+(artifact?.version||'none');
export function gateSummary(artifact=investmentArtifact){
 const checks=artifact?.gate?.checks||[];
 return {version:artifact?.version||null,status:artifact?.status||'missing',promoted:!!artifact?.promoted,passed:checks.filter(c=>c.pass).length,total:checks.length,
  failed:checks.filter(c=>!c.pass).map(c=>({id:c.id,label:c.label})),forecastSelected:artifact?.forecastSelected||null};
}
const STATUS_CODE={supported:'S',limited:'L',insufficient:'I',unsupported:'U'};

// Research for every card at `now`. Compact output is for the list: {card_id:[psa10,psa9,raw]}.
export function investmentTable(entries,{now=Date.now(),release={},mode='shadow',artifact=investmentArtifact,lang='en'}={}){
 const research=researchTable(entries,{now,release}),ranks={},status={};
 for(const [id,byGrade] of research.table){
  const r=['psa10','psa9','raw'].map(g=>byGrade[g]?.rank??null);
  if(r.some(v=>v!=null))ranks[id]=r;
  status[id]=['psa10','psa9','raw'].map(g=>STATUS_CODE[byGrade[g]?.evidenceStatus]||'U').join('');
 }
 // Each language is its own reference universe, archived under its own model version.
 return {modelVersion:modelVersion(artifact)+(lang==='en'?'':'+'+lang),mode,asOf:research.asOf,horizonMonths:artifact?.horizonMonths??12,research,ranks,status,gate:gateSummary(artifact),artifact,languages:[lang]};
}
// One lookup table over several per-language tables (card ids never overlap). `parts` keeps each
// language's own table for archiving.
export function mergeInvestmentTables(tables){
 if(tables.length===1)return {...tables[0],parts:tables};
 const [first]=tables;
 return {...first,languages:tables.flatMap(t=>t.languages),ranks:Object.assign({},...tables.map(t=>t.ranks)),status:Object.assign({},...tables.map(t=>t.status)),
  research:{...first.research,table:new Map(tables.flatMap(t=>[...t.research.table])),reference:Object.assign({},...tables.map(t=>Object.fromEntries(Object.entries(t.research.reference).map(([k,v])=>[t.languages[0]+'|'+k,v]))))},parts:tables};
}

// The full research view for one card and grade. `reference` is the confident sold median
// (or null); `costs` the viewer's assumptions; `ask` an optional asking price.
export function investmentView(table,cardId,grade,{reference=null,referenceLabel=null,costs=DEFAULT_COSTS,ask=null}={}){
 const e=table?.research?.table.get(cardId)?.[grade];if(!e)return null;
 const artifact=table.artifact,gate=table.gate;
 const supportedGrade=(artifact?.supportedGrades||[]).includes(grade==='psa9'?'grade9':grade);
 const raw=e.features&&e.rank!=null&&e.basis?.key!=='matching-sales'?modelForecast(artifact,{grade,features:e.features,price:e.features.price,ageMonths:e.ageMonths}):null;
 let forecast=null,withheld=null;
 if(table.mode!=='candidate')withheld=gate.promoted?'Forecasts are switched off (shadow mode).':`Withheld: the 12-month model has not passed its validation gate (${gate.passed} of ${gate.total} checks).${gate.forecastSelected==='constant'?' On held-out data an unchanged price forecast better than the model.':''}`;
 else if(!supportedGrade)withheld='Withheld: this grade only has mixed-condition or mixed-grader history, which cannot support a forecast.';
 else if(e.evidenceStatus!=='supported'&&e.evidenceStatus!=='limited')withheld='Withheld: not enough evidence for this card.';
 else if(!raw?.E10||!(reference>0))withheld='Withheld: no confident sold price to apply the forecast to.';
 else{
  // The model's growth is applied to the confident sold median, never to a guide value.
  const growth10=raw.E10/e.features.price,growth=raw.expected/e.features.price,E10=reference*growth10;
  forecast={basis:'model',expectedExit:reference*growth,conservativeExit:E10,
   netReturnQuantiles:{p10:netReturn(ask>0?ask:reference,E10,costs)},maxBuyPrice:maxBuyPrice(E10,costs),
   note:'Conservative exit is the 10th percentile of held-out outcomes, not a confidence bound.'};
 }
 const part=table.parts?.find(p=>p.research.table.has(cardId))||table;
 return {
  modelVersion:part.modelVersion,mode:table.mode,asOf:table.asOf,horizonMonths:table.horizonMonths,
  evidenceStatus:e.evidenceStatus,reasons:[...new Set(e.reasons)].map(code=>({code,text:REASONS[code]||code})),
  rank:e.rank,rankLabel:'Historical ranking percentile (uncalibrated). Not a probability of profit.',
  rankMonth:e.t,reference:e.reference||null,percentiles:e.percentiles||null,
  basis:e.basis?{key:e.basis.key,label:e.basis.label,matched:e.basis.matched}:null,
  salesEvidence:e.salesEvidence,
  forecastBasis:forecast?'model':null,forecast,forecastWithheld:withheld,probability:null,
  netReturnQuantiles:forecast?.netReturnQuantiles||null,maxBuyPrice:forecast?.maxBuyPrice??null,
  costs:costSummary({ask,reference,costs}),costAssumptions:costs,costProfile:COST_PROFILE_VERSION,
  priceReference:{price:reference,label:referenceLabel},gate,
 };
}
// Rows for score_observations: what both systems said today, archived before outcomes exist.
export function archiveRows(table,legacy,{recordedAt=new Date().toISOString()}={}){
 const day=table.asOf.slice(0,10),rows=[];
 for(const [id,byGrade] of table.research.table)for(const g of ['raw','psa9','psa10']){
  const e=byGrade[g],old=legacy?.full?.get(id)?.[g]?.score??null;
  if(e.evidenceStatus==='unsupported'&&old==null)continue;
  const shadow=e.features&&e.rank!=null?modelForecast(table.artifact,{grade:g,features:e.features,price:e.features.price,ageMonths:e.ageMonths}):null;
  rows.push({model_version:table.modelVersion,as_of:day,card_id:id,grade:g,legacy_score:old,research_rank:e.rank,evidence_status:e.evidenceStatus,
   payload:JSON.stringify({mode:table.mode,basis:e.basis?.key||null,month:e.t,features:e.features,reasons:e.reasons,shadowForecast:shadow?{mu:shadow.mu,E10ratio:shadow.E10!=null?shadow.E10/e.features.price:null}:null}),recorded_at:recordedAt});
 }
 return rows;
}
export async function archiveScores(db,table,legacy,{chunk=400,runInfo={}}={}){
 const rows=archiveRows(table,legacy);if(!rows.length)return 0;
 const cols=Object.keys(rows[0]),sql=`INSERT OR IGNORE INTO score_observations (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`;
 for(let i=0;i<rows.length;i+=chunk)await db.batch(rows.slice(i,i+chunk).map(r=>db.prepare(sql).bind(...cols.map(c=>r[c]))));
 await db.prepare('INSERT INTO model_runs (model_version,kind,mode,as_of,dataset_revision,artifact_hash,cost_profile,horizon_months,summary,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .bind(table.modelVersion,'shadow-inference',table.mode,table.asOf,runInfo.datasetRevision||null,table.artifact?.hashes?.code||null,COST_PROFILE_VERSION,table.horizonMonths,JSON.stringify({rows:rows.length,ranked:rows.filter(r=>r.research_rank!=null).length,gate:table.gate}),new Date().toISOString()).run();
 return rows.length;
}
