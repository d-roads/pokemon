// Error reporting to Sentry over plain HTTPS: no SDK, so the app stays dependency-free and still builds as a single Worker.
// It does nothing unless SENTRY_DSN is set. Only the error type, a trimmed message and stack frames (file name and line, never full paths)
// are sent. Request bodies, headers, settings and eBay keys are never included.
const MESSAGE_LIMIT=500,STACK_LIMIT=40,HOURLY_LIMIT=30,REPEAT_SECONDS=60;
const recentReports=new Map();let hourStart=0,hourCount=0;
export function parseDsn(dsn){
 try{const url=new URL(dsn),project=url.pathname.replace(/^\//,'');if(url.protocol!=='https:'||!url.username||!/^\d+$/.test(project))return null;return {key:url.username,host:url.host,project};}catch{return null;}
}
const clip=(text,limit)=>String(text??'').slice(0,limit);
// Links in error messages can carry tokens in their query strings, so keep only the site.
const scrubMessage=text=>clip(text,MESSAGE_LIMIT).replace(/https?:\/\/[^\s)'"]+/g,link=>{try{return new URL(link).origin;}catch{return '[link]';}});
const baseName=file=>String(file||'').split(/[\\/]/).pop().split('?')[0];
// Reads V8 ("at fn (file:1:2)") and Firefox/Safari ("fn@file:1:2") stack lines. Oldest frame first, as Sentry expects.
export function stackFrames(stack){
 const frames=[];
 for(const line of String(stack||'').split('\n').slice(0,STACK_LIMIT)){
  const v8=line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/),gecko=v8?null:line.match(/^\s*(.*?)@(.+?):(\d+):(\d+)$/);
  const m=v8||gecko;if(m)frames.push({function:m[1]||'?',filename:baseName(m[2]),lineno:Number(m[3]),colno:Number(m[4])});
 }
 return frames.reverse();
}
export function buildEvent(error,context={},env={}){
 const err=error instanceof Error?error:new Error(String(error));
 const frames=stackFrames(err.stack);
 return {
  event_id:crypto.randomUUID().replace(/-/g,''),timestamp:Date.now()/1000,platform:'javascript',level:context.level||'error',
  environment:env.SENTRY_ENV||(env.LOCAL_USER_ID?'local':'production'),
  exception:{values:[{type:clip(err.name||'Error',100),value:scrubMessage(err.message),...(frames.length?{stacktrace:{frames}}:{})}]},
  tags:{source:context.source||'server',...(context.route?{route:clip(context.route,120)}:{})}
 };
}
export function buildEnvelope(event,dsn){
 return [JSON.stringify({event_id:event.event_id,sent_at:new Date().toISOString(),dsn}),JSON.stringify({type:'event'}),JSON.stringify(event)].join('\n');
}
// Returns true when Sentry accepted the event. Never throws and never waits long, so a reporting problem cannot break a request.
export async function reportError(env,error,context={}){
 try{
  const dsn=parseDsn(env?.SENTRY_DSN);if(!dsn||env.NETWORK_DISABLED)return false;
  const now=Date.now(),fingerprint=(context.source||'server')+'|'+(error?.name||'')+'|'+clip(error?.message,120);
  if(now-hourStart>3600000){hourStart=now;hourCount=0;}
  // A crash loop must not use up the free monthly quota: skip repeats within a minute and cap each hour.
  if(hourCount>=HOURLY_LIMIT||now-(recentReports.get(fingerprint)||0)<REPEAT_SECONDS*1000)return false;
  hourCount++;recentReports.set(fingerprint,now);if(recentReports.size>200)recentReports.delete(recentReports.keys().next().value);
  const event=buildEvent(error,context,env);
  const response=await (env.fetch||fetch)(`https://${dsn.host}/api/${dsn.project}/envelope/?sentry_key=${dsn.key}&sentry_version=7`,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body:buildEnvelope(event,env.SENTRY_DSN),signal:AbortSignal.timeout(4000)});
  return response.ok;
 }catch{return false;}
}
// Test helper: forget what has been reported so each test starts clean.
export function resetReportLimits(){recentReports.clear();hourStart=0;hourCount=0;}
