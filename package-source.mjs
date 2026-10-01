import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'file:///C:/Users/b345t/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip/lib/index.js';
const root=path.dirname(fileURLToPath(import.meta.url));const site=path.join(root,'site');const zip=new JSZip();
function walk(dir,relative=''){for(const entry of readdirSync(dir,{withFileTypes:true})){const rel=path.posix.join(relative,entry.name);if(entry.name==='dist'||entry.name.includes('.sqlite')||/^localhost-.*\.log$/.test(entry.name))continue;if(entry.isDirectory())walk(path.join(dir,entry.name),rel);else zip.file(rel,readFileSync(path.join(dir,entry.name)));}}
walk(site);const output=path.join(root,'primal-watch.zip');writeFileSync(output,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
const checked=await JSZip.loadAsync(readFileSync(output));for(const f of ['data/catalog.mjs','data/market.mjs','public/index.html','lib/api.mjs','server.mjs'])if(!checked.file(f))throw new Error('Archive missing '+f);
console.log(JSON.stringify({archive:output,files:Object.keys(checked.files).length,bytes:readFileSync(output).length}));
