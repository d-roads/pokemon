// Usage: node ingest.mjs <tool-result-file>...  Handles PWPART chunks; assembles work/raw/<tag>.json when complete.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const dir='/home/claude/work/raw/';mkdirSync(dir+'parts',{recursive:true});
function decode(file){
 const raw=readFileSync(file,'utf8');let texts;try{texts=JSON.parse(raw).map(x=>x.text||'');}catch{texts=[raw];}
 let s=texts.find(t=>t.includes('PWPART|'));if(!s)throw new Error('No PWPART in '+file);s=s.trim();
 if(s.startsWith('"')){let i=1;for(;i<s.length;i++){if(s[i]==='\\'){i++;continue;}if(s[i]==='"')break;}s=JSON.parse(s.slice(0,i+1));}
 if(s.includes('[truncated'))throw new Error('Truncated part in '+file);
 const start=s.indexOf('PWPART|');const end=s.lastIndexOf('|PWEND');if(end<0)throw new Error('Missing PWEND (truncated?) in '+file);
 const head=s.slice(start,start+300).split('|');const [,tag,i,n]=head;const prefix=['PWPART',tag,i,n].join('|')+'|';
 return {tag,i:Number(i),n:Number(n),chunk:s.slice(start+prefix.length,end)};
}
const done=new Set();
for(const f of process.argv.slice(2)){const p=decode(f);writeFileSync(dir+'parts/'+p.tag+'.'+p.i+'of'+p.n,p.chunk);done.add(p.tag+'|'+p.n);}
for(const k of done){const [tag,n]=k.split('|');const files=[...Array(Number(n)).keys()].map(i=>dir+'parts/'+tag+'.'+i+'of'+n);
 const missing=files.filter(f=>!existsSync(f));if(missing.length){console.log(JSON.stringify({tag,missing:missing.length}));continue;}
 let json=files.map(f=>readFileSync(f,'utf8')).join('');if(json.startsWith('H4sI'))json=gunzipSync(Buffer.from(json,'base64')).toString('utf8');const data=JSON.parse(json);writeFileSync(dir+tag+'.json',json);files.forEach(f=>unlinkSync(f));
 console.log(JSON.stringify({tag,complete:true,bytes:json.length,items:Array.isArray(data)?data.length:Object.keys(data).length}));}
