import {readFileSync,writeFileSync} from 'node:fs';
let build=readFileSync('build.mjs','utf8');build=build.replace("${strip(readFileSync('lib/provider.mjs','utf8'))}","${strip(readFileSync('lib/sales.mjs','utf8'))}\\n${strip(readFileSync('lib/provider.mjs','utf8'))}");writeFileSync('build.mjs',build);
