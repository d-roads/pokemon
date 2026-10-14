// Update sales on the server. One shared job reads card pages at a steady pace with a few workers,
// so a full update no longer waits on the browser or on the slowest page of a batch. The page only
// follows the job's progress, and the job keeps going if the page is closed.

// Starts requests evenly at `rate` per second. A "too many requests" or busy answer halves the pace
// and pauses everyone for a while; after a run of good answers the pace climbs back, never above `rate`.
export function pacer({rate=3,floor=0.5,pauseMs=15000,recoverAfter=50,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let current=rate,next=0,until=0,streak=0;
 return {
  get rate(){return current;},
  async wait(){for(;;){const t=now(),start=Math.max(t,next,until);next=start+1000/current;if(start>t)await sleep(start-t);if(now()>=until)return;}},
  ok(){if(++streak>=recoverAfter&&current<rate){current=Math.min(rate,current+0.25);streak=0;}},
  busy(){streak=0;current=Math.max(floor,current/2);until=Math.max(until,now()+pauseMs);},
 };
}

const BUSY=/\((?:429|5\d\d)\)/,FLAKY=/timeout|aborted|fetch failed|network/i;
let jobCount=0;
// queue: cards in reading order. fetchPage(url) returns the page; capture(card,html) parses and saves it.
// A busy or timed-out page goes back to the end of the queue, up to `attempts` reads in all.
export function startJob(queue,{fetchPage,capture,pace=pacer(),concurrency=6,attempts=3,owner=null,info={},now=()=>Date.now()}){
 const job={id:++jobCount,owner,state:'running',total:queue.length,done:0,updated:0,failures:new Map(),changed:[],startedAt:new Date(now()).toISOString(),finishedAt:null,cancelled:false,pace,...info};
 const pending=queue.map(card=>({card,tries:0}));
 async function worker(){
  while(!job.cancelled){
   const item=pending.shift();if(!item)return;
   await pace.wait();if(job.cancelled)return;
   item.tries++;
   try{
    const html=await fetchPage(item.card.source);pace.ok();
    await capture(item.card,html);
    job.updated++;job.done++;job.changed.push(item.card.id);
   }catch(e){
    const message=String(e?.message||e),busy=BUSY.test(message);
    if(busy)pace.busy();
    if((busy||FLAKY.test(message))&&item.tries<attempts){pending.push(item);continue;}
    job.failures.set(item.card.id,message);job.done++;
   }
  }
 }
 job.finished=Promise.all(Array.from({length:Math.min(concurrency,pending.length)},worker))
  .then(()=>{job.state=job.cancelled?'cancelled':'done';})
  .catch(e=>{job.state='failed';job.error=e.message;})
  .finally(()=>{job.finishedAt=new Date(now()).toISOString();});
 return job;
}
export function cancelJob(job){if(job?.state==='running')job.cancelled=true;return job;}

// What the page needs: progress, the cards saved since its last look (at most `limit`, oldest first),
// and the failures once the job has ended.
export function jobStatus(job,since=0,limit=400){
 if(!job)return null;
 const from=Math.max(0,Math.min(Number(since)||0,job.changed.length)),changed=job.changed.slice(from,from+limit);
 return {id:job.id,state:job.state,total:job.total,done:job.done,updated:job.updated,failed:job.failures.size,skipped:job.skipped||0,grand:job.grand||job.total,
  rate:Math.round(job.pace.rate*100)/100,startedAt:job.startedAt,finishedAt:job.finishedAt,error:job.error||null,
  changed,next:from+changed.length,failures:job.state==='running'?[]:[...job.failures].slice(0,200).map(([card_id,message])=>({card_id,message}))};
}
