// Reads the TCGdex cards-database (MIT licence, https://github.com/tcgdex/cards-database) without
// TypeScript tooling: each set/card file is one object literal, evaluated in an empty sandbox.
// Usage from another script: loadTcgdex('/path/to/cards-database') -> {asia:{series,sets,cards}, intl:{...}}
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
function literal(file){
 const src=readFileSync(file,'utf8')
  .replace(/^\s*import[^\n]*\n/gm,'')
  .replace(/^\s*export\s+default\s+\w+\s*;?\s*$/gm,'')
  .replace(/const\s+\w+\s*:\s*\w+(?:<[^>]*>)?\s*=\s*\{/,'__out={')
  .replace(/\b(set|serie)\s*:\s*(Set|serie|Serie)\s*,/g,'$1:null,')
  .replace(/\bas\s+const\b/g,'');
 const sandbox={__out:null};vm.runInNewContext(src,sandbox,{timeout:2000,filename:file});
 if(!sandbox.__out)throw new Error('No object in '+file);
 return JSON.parse(JSON.stringify(sandbox.__out));
}
function tree(root){
 const series=[],sets=[],cards=[];
 for(const f of readdirSync(root).filter(f=>f.endsWith('.ts'))){
  const sid=f.slice(0,-3),serie=literal(path.join(root,f));series.push({...serie,id:serie.id||sid});
  const dir=path.join(root,sid);if(!existsSync(dir)||!statSync(dir).isDirectory())continue;
  for(const sf of readdirSync(dir).filter(f=>f.endsWith('.ts'))){
   const setId=sf.slice(0,-3),set=literal(path.join(dir,sf));set.id=set.id||setId;set.serie=serie.id||sid;sets.push(set);
   const cdir=path.join(dir,setId);if(!existsSync(cdir))continue;
   for(const cf of readdirSync(cdir).filter(f=>f.endsWith('.ts'))){
    const card=literal(path.join(cdir,cf));card.localId=cf.slice(0,-3);card.setId=set.id;card.serie=set.serie;cards.push(card);
   }
  }
 }
 return {series,sets,cards};
}
export function loadTcgdex(root){
 return {asia:tree(path.join(root,'data-asia')),intl:tree(path.join(root,'data'))};
}
