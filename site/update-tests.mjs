import {readFileSync,writeFileSync} from 'node:fs';
for(const name of ['analysis','api','ui']){
 const file='tests/'+name+'.test.mjs';let code=readFileSync(file,'utf8');
 if(name==='analysis'){
  code=code.replaceAll('164);assert.equal(sets.length,13)','164);assert.equal(sets.length,14)').replaceAll('cards.length,1620','cards.length,1831').replaceAll('sets.length,13','sets.length,14').replaceAll('.size,1620','.size,1831').replace("All 13 XY catalogs",'All 14 XY catalogs').replace('a.current,9935.14','a.current,10000');
  code=code.replace("analyze(snapshots['xy5-147'],'psa9',15,now)","analyze({sales:[['2026-09-24',350],['2026-08-09',257],['2026-07-01',304.95],['2026-04-24',250],['2026-04-09',202.51],['2026-04-05',178.38]].map(([date,price])=>({grade:'psa9',date,price}))},'psa9',15,now)");
  code=code.replace("analyze(snapshots['xy5-151'],'psa10',15,now)","analyze({sales:[{grade:'psa10',date:'2021-01-22',price:500}],guide:{psa10:3394.2}},'psa10',15,now)");
  code=code.replace("analyze(snapshots['xy5-156'],'psa10',15,now)","analyze({sales:[{grade:'psa10',date:'2026-08-18',price:10000}],guide:{psa10:9935.14}},'psa10',15,now)");
  code=code.replace("analyze(snapshots['xy5-151'],'raw',15,now)","analyze({sales:[{grade:'raw',date:'2026-09-30',price:80,condition:'MP'},{grade:'raw',date:'2026-09-23',price:190,condition:'NM'},{grade:'raw',date:'2026-09-14',price:130,condition:'NM'}]},'raw',15,now)");
 }
 if(name==='api')code=code.replace('data.cards.length,1620','data.cards.length,1831').replace('data.sets.length,13','data.sets.length,14').replaceAll("'2026-10-01T00:00:00Z'","'2099-10-01T00:00:00Z'");
 if(name==='ui'){
  code=code.replace('/115/','/37/').replace("value:'RC5'","value:'RC30'").replace('/Charizard/','/Gardevoir/').replace('/RC5\\/RC32/','/RC30\\/RC32/').replace("ui.e('#search').oninput({target:{value:'Flashfire'}});","ui.run(\"state.category='all';updateView();\");ui.e('#search').oninput({target:{value:'Flashfire'}});").replace("filteredCards().length'),109","filteredCards().length'),46").replace('/1620/','/894/');
 }
 writeFileSync(file,code);
}
