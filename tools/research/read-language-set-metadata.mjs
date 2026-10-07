import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const captured=JSON.parse(readFileSync(process.argv[2],'utf8'));
const sets=captured.sets.map(({row,path,source})=>{
 const src=source.replace(/^\s*import[^\n]*\n/gm,'').replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm,'').replace(/const\s+\w+\s*:\s*\w+\s*=\s*\{/,'__out={').replace(/\bserie\s*:\s*\w+\s*,/g,'serie:null,');
 const ctx={__out:null};vm.runInNewContext(src,ctx,{timeout:1000});const d=ctx.__out;if(!d)throw Error('Unreadable metadata '+path);
 const release=row.release||(typeof d.releaseDate==='string'?d.releaseDate:d.releaseDate?.ja)||null;
 return {...row,release,printedTotal:row.printedTotal??d.cardCount?.official??null,nameJa:d.name?.ja||null,source:'https://github.com/tcgdex/cards-database/blob/'+captured.commit+'/'+path};
});
const result={source:'TCGdex cards-database (MIT)',commit:captured.commit,sets};
writeFileSync(new URL('./japanese-set-metadata.json',import.meta.url),JSON.stringify(result,null,1)+'\n');
console.log(JSON.stringify({sets:sets.length,missingRelease:sets.filter(s=>!s.release).map(s=>s.tcgdex)}));
