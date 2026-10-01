import {readFileSync,writeFileSync} from 'node:fs';
const file='public/app.js';let code=readFileSync(file,'utf8');
code=code.replace('<small>${esc(a.priceLabel)}</small>${a.sampleCount?', '<small>${esc(a.priceLabel)}</small>${state.grade===\'psa9\'&&a.guidePrice?`<small>Mixed Grade 9 guide: ${money(a.guidePrice)}</small>`:\'\'}${a.sampleCount?');
writeFileSync(file,code);
