import {cards,sets} from '/home/claude/pokemon/site/data/catalog.mjs';
import {snapshots,captureCount} from '/home/claude/pokemon/site/data/market.mjs';
import {analyze} from '/home/claude/pokemon/site/lib/analysis.mjs';
const now=Date.parse(process.argv[2]||'2026-10-01T12:00:00Z');
const out={captures:captureCount,bySeries:{}};
for(const series of ['XY','BW']){
 const elig=cards.filter(c=>c.eligible&&c.series===series),full=elig.filter(c=>snapshots[c.id]?.research?.status==='full');
 const g={};for(const grade of ['raw','psa9','psa10']){let any=0,median=0,target=0,stale=0,sales=0;for(const c of elig){const a=analyze(snapshots[c.id],grade,15,now);sales+=a.all.length;if(a.comparable.length)any++;if(a.priceSource==='sales')median++;if(a.target!=null)target++;if(a.comparable.length&&a.latestAge>180)stale++;}g[grade]={withSales:any,soldMedian:median,buyTarget:target,staleOnly:stale,sales};}
 const priced=elig.filter(c=>['raw','psa9','psa10'].some(gr=>analyze(snapshots[c.id],gr,15,now).current!=null)).length;
 out.bySeries[series]={eligible:elig.length,fullCaptures:full.length,missing:elig.filter(c=>snapshots[c.id]?.research?.status!=='full').map(c=>c.id).slice(0,30),anyPrice:priced,grades:g};
}
console.log(JSON.stringify(out,null,1));
