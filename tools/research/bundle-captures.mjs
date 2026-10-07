// Merge full card-page capture records into the bundled captures (site/data/pricecharting/<set>.json).
//
// Input is JSON Lines, one {id, setId, record} per card, where record is classifyCapture() output
// (the format every bundled capture file uses). English cards only: Japanese products are mapped
// per database (source_map), so their captures are imported with import-collected.mjs instead.
//
// A record is added when the card has no bundled capture. Existing records are inputs to the frozen
// investment study (backtest-investment.mjs reproduces its figures from them), so they are kept
// unless --replace is given; then a newer record replaces one only if it is not thinner (at least
// as many history months and accepted sales). Anything that fails the app's own identity rules is
// rejected and reported. Output is deterministic: rerunning with the same input changes nothing.
//
// Usage (repository root):
//   node tools/research/bundle-captures.mjs <records.jsonl> [--dry-run] [--replace] [--at=2026-10-07T10:00:00Z]
// Writes the touched capture files and tools/research/research-coverage.json.
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url)),captureDir=root+'site/data/pricecharting/';

export const months=r=>Math.max(0,...Object.values(r?.history||{}).map(v=>v.length));
// Why a record cannot be bundled for this card, or null.
export function rejectReason(card,record,matchesCard){
 if(!card)return 'unknown-card';
 if(card.japanese||card.lang==='ja')return 'japanese';
 if(!card.eligible)return 'not-eligible';
 if(!card.source)return 'no-source';
 if((card.vintage||card.modern)&&!card.sourceVerified)return 'unverified-source';
 if(!record||typeof record!=='object'||!record.fetchedAt||!Array.isArray(record.sales))return 'malformed';
 if(/search-products/.test(record.url||''))return 'search-redirect';
 if(record.url!==card.source)return 'url-mismatch';
 if((card.vintage||card.modern)&&!matchesCard(record.name,card))return 'name-mismatch';
 if(!months(record)&&!record.sales.length&&!Object.keys(record.guide||{}).length)return 'empty';
 return null;
}
// Keep the bundled record unless the new one is newer and at least as complete.
export function shouldReplace(old,next){
 if(!old)return true;
 if(String(next.fetchedAt)<=String(old.fetchedAt))return false;
 return months(next)>=months(old)&&next.sales.length>=(old.sales||[]).length;
}
// One card per line, keys sorted, like process-pages.mjs. A file that was pretty-printed (two-space
// indent, as capture-modern.mjs writes) stays pretty-printed with its cards in their existing order
// and new cards appended in id order, so its diff shows only the added cards.
export const isPretty=text=>/^\{\n  "/.test(text||'');
export function serialize(data,original){
 if(isPretty(original)){const old=Object.keys(JSON.parse(original)),seen=new Set(old),keys=[...old.filter(k=>k in data),...Object.keys(data).filter(k=>!seen.has(k)).sort((a,b)=>a.localeCompare(b))];return JSON.stringify(Object.fromEntries(keys.map(k=>[k,data[k]])),null,2)+'\n';}
 return '{\n'+Object.entries(data).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'\n}\n';
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,...flags]=process.argv.slice(2);
 if(!input)throw new Error('Usage: node tools/research/bundle-captures.mjs <records.jsonl> [--dry-run] [--replace] [--at=ISO]');
 const dryRun=flags.includes('--dry-run'),replace=flags.includes('--replace'),at=flags.find(f=>f.startsWith('--at='))?.slice(5);
 const {cards,sets}=await import('../../site/data/catalog.mjs');
 const {matchesCard}=await import('../../site/lib/sales.mjs');
 const byId=new Map(cards.map(c=>[c.id,c]));
 const lines=readFileSync(input,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
 // The latest record per card wins inside the input too.
 const latest=new Map();for(const l of lines)if(!latest.has(l.id)||String(l.record?.fetchedAt)>String(latest.get(l.id).record?.fetchedAt))latest.set(l.id,l);
 const files=new Map(),report={input:input.split('/').slice(-1)[0],records:lines.length,cards:latest.size,skippedJapanese:0,added:0,replaced:0,kept:0,rejected:{},bySet:{}};
 const load=setId=>{if(!files.has(setId)){const f=captureDir+setId+'.json',text=existsSync(f)?readFileSync(f,'utf8'):null;files.set(setId,{data:text?JSON.parse(text):{},text,changed:false});}return files.get(setId);};
 for(const {id,record} of [...latest.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  if(id.startsWith('ja-')){report.skippedJapanese++;continue;}
  const card=byId.get(id),why=rejectReason(card,record,matchesCard);
  if(why){(report.rejected[why]||(report.rejected[why]=[])).push(id);continue;}
  const file=load(card.setId),old=file.data[id],s=report.bySet[card.setId]||(report.bySet[card.setId]={added:0,replaced:0,kept:0});
  if(!old){file.data[id]=record;file.changed=true;report.added++;s.added++;}
  else if(replace&&shouldReplace(old,record)){file.data[id]=record;file.changed=true;report.replaced++;s.replaced++;}
  else{report.kept++;s.kept++;}
 }
 for(const [setId,{data,text,changed}] of files)if(changed&&!dryRun){const f=captureDir+setId+'.json',tmp=f+'.'+process.pid+'.tmp';writeFileSync(tmp,serialize(data,text));renameSync(tmp,f);}
 report.filesChanged=[...files].filter(([,f])=>f.changed).map(([k])=>k).sort();
 // Research-rank coverage on the bundled data as it now stands (fresh import so new files load).
 if(!dryRun){
  const {snapshots}=await import('../../site/data/market.mjs');
  const {researchTable}=await import('../../site/lib/investment-features.mjs');
  const release=Object.fromEntries(sets.map(s=>[s.id,s.release])),now=at?Date.parse(at):Date.now();
  const english=cards.filter(c=>(c.lang||'en')==='en'),t=researchTable(english.map(c=>[c,snapshots[c.id]]),{now,release});
  const bySeries={},blockers={},order=['not-eligible','unverified-source','cohort-not-validated','too-new','no-history','history-gap','flat-history','below-floor'];
  for(const c of english){
   if(!c.eligible)continue;const e=t.table.get(c.id),ranked=['raw','psa9','psa10'].some(g=>e[g].rank!=null),s=bySeries[c.series]||(bySeries[c.series]={eligible:0,ranked:0});s.eligible++;
   if(ranked){s.ranked++;continue;}
   const per=['raw','psa9','psa10'].map(g=>e[g].reasons.filter(r=>order.includes(r)).sort((a,b)=>order.indexOf(a)-order.indexOf(b))[0]).filter(Boolean);
   const why=per.find(r=>order.indexOf(r)<4)||(!snapshots[c.id]?'no-market':per.sort((a,b)=>order.indexOf(b)-order.indexOf(a))[0]||'unknown');
   blockers[why]=(blockers[why]||0)+1;
  }
  report.coverage={asOf:new Date(now).toISOString(),rankVersion:t.version,eligible:english.filter(c=>c.eligible).length,ranked:Object.values(bySeries).reduce((n,s)=>n+s.ranked,0),bySeries,unrankedBy:blockers};
  writeFileSync(root+'tools/research/research-coverage.json',JSON.stringify(report,null,1)+'\n');
 }
 const {bySet,rejected,...summary}=report;
 console.log(JSON.stringify({...summary,rejected:Object.fromEntries(Object.entries(rejected).map(([k,v])=>[k,v.length]))},null,1));
}
