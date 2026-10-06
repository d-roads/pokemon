// Reproducible modern coverage / model audit over saved evidence, no network calls.
// Usage: node tools/research/audit-modern.mjs swsh|later
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {cards,sets} from '../../site/data/catalog.mjs';
import {snapshots} from '../../site/data/market.mjs';
import {investmentScores} from '../../site/lib/score.mjs';
import {analyze,trendProjection,median} from '../../site/lib/analysis.mjs';
import {matchesCard,gradeOf} from '../../site/lib/sales.mjs';
const era=process.argv[2],eraSets=era==='swsh'?['SWSH']:era==='later'?['SV','ME']:null;
if(!eraSets)throw new Error('Choose swsh or later.');
const now=Date.now(),modern=cards.filter(c=>c.modern&&eraSets.includes(c.series)&&c.eligible),scores=investmentScores(cards.map(c=>[c,snapshots[c.id]]),{now});
const report={checkedAt:new Date(now).toISOString(),eligible:modern.length,captured:0,sales:0,ebaySales:0,invalidSales:[],grades:{},missing:[],completeEbayHistory:false,forecastLimitation:'Holdouts test the end of the captured trailing year. They do not validate 1–3 year investment returns. Scores are uncalibrated historical screens, not probabilities of profit.'};
for(const set of sets.filter(s=>eraSets.includes(s.series))){
 const file=new URL('../../site/data/pricecharting/'+set.id+'.json',import.meta.url);if(!existsSync(file))continue;
 for(const [id,r] of Object.entries(JSON.parse(readFileSync(file,'utf8')))){const c=cards.find(c=>c.id===id);
  for(const [date,price,grade,,,,title] of r.sales){if(!c||!matchesCard(title,c)||gradeOf(title)!==grade||!Number.isFinite(price)||price<=0||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>report.checkedAt.slice(0,10))report.invalidSales.push({id,title});}
 }
}
for(const c of modern){const m=snapshots[c.id];if(!m){report.missing.push(c.id);continue;}report.captured++;
 for(const sale of m.sales){report.sales++;if(sale.marketplace==='eBay')report.ebaySales++;}
}
for(const g of ['psa10','psa9','raw']){
 const values=[],errors=[],baselineErrors=[],reasons={};let forecasts=0;
 for(const c of modern){const m=snapshots[c.id],score=scores.full.get(c.id)?.[g]?.score;if(score!=null)values.push(score);
  const a=analyze(m,g,15,now),checked=Date.parse(m?.research?.checkedAt||m?.observedAt),fresh=Number.isFinite(checked)&&now-checked<=14*86400000,p=fresh?trendProjection(a.comparable,a.fair,now):{available:false,reason:'Refresh sales before projecting a trend.'};
  if(p.available){forecasts++;errors.push(p.validation.mape);baselineErrors.push(p.validation.baselineMape);}else reasons[p.reason]=(reasons[p.reason]||0)+1;
 }
 report.grades[g]={scored:values.length,medianScore:median(values),forecasts,medianAcceptedHoldoutError:median(errors),medianAcceptedBaselineError:median(baselineErrors),withheld:reasons};
}
writeFileSync(new URL('./modern-audit-'+era+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,missing:report.missing.length},null,2));
if(report.invalidSales.length)process.exitCode=1;
