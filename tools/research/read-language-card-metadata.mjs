import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const dir=process.argv[2],out=[];
for(const f of readdirSync(dir).filter(f=>/^language-card-source-.*\.json$/.test(f)))for(const entry of JSON.parse(readFileSync(dir+'/'+f,'utf8'))){
 const src=entry.source.replace(/^\s*import[^\n]*\n/gm,'').replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm,'').replace(/const\s+\w+\s*:\s*\w+\s*=\s*\{/,'__out={').replace(/\bset\s*:\s*\w+\s*,/g,'set:null,');
 const ctx={__out:null};try{vm.runInNewContext(src,ctx,{timeout:1000});}catch(e){throw Error(entry.path+': '+e.message);}
 const d=ctx.__out;if(!d)throw Error('Unreadable '+entry.path);
 out.push({id:entry.id,setId:entry.setId,number:entry.number,names:d.name||{},category:d.category,rarity:d.rarity,illustrator:d.illustrator||null,dexId:d.dexId||[],source:'https://github.com/tcgdex/cards-database/blob/4199850a6af49665db0080fa2bb9ef751750a406/'+entry.path});
}
writeFileSync(new URL('./japanese-card-metadata.json',import.meta.url),JSON.stringify({source:'TCGdex cards-database (MIT)',cards:out},null,1)+'\n');console.log({cards:out.length});
