const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const QUICK_TUNNEL_HOST=/^[a-z0-9-]+\.trycloudflare\.com$/i;

export function requestLocation(req,port,listenHost){
 const host=req.headers.host;
 const tunnel=LOOPBACK.has(req.socket.remoteAddress)&&req.headers['x-forwarded-proto']==='https'&&QUICK_TUNNEL_HOST.test(host||'');
 const local=host===`localhost:${port}`||host===`127.0.0.1:${port}`;
 const lan=listenHost==='0.0.0.0'&&host?.endsWith(`:${port}`);
 if(!local&&!lan&&!tunnel)return null;
 return {url:new URL(req.url,`${tunnel?'https':'http'}://${host}`),tunnel};
}
