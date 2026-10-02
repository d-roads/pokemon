import {cards} from '/home/claude/pokemon/site/data/catalog.mjs';
import {snapshots} from '/home/claude/pokemon/site/data/market.mjs';
import {analyze} from '/home/claude/pokemon/site/lib/analysis.mjs';
const now=Date.parse('2026-10-01T12:00:00Z');
for(const id of process.argv.slice(2)){const c=cards.find(c=>c.id===id),m=snapshots[id];console.log('\n=== '+id+' '+c.name+' '+c.numberLabel+' · '+m?.research?.status+' · guide '+JSON.stringify(m?.guide));
 for(const g of ['raw','psa9','psa10']){const a=analyze(m,g,15,now);console.log(` ${g}: current ${a.current} (${a.priceLabel}) target ${a.target} n=${a.sampleCount} window ${a.windowDays} all=${a.all.length} excluded=${a.excluded} latestAge=${a.latestAge}`);
  for(const s of a.usable.slice(0,4))console.log(`    ${s.date} $${s.price} ${s.condition||''} ${String(s.title||'').slice(0,80)}`);}}
