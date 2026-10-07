// Build label shown in the page and the server window. The channel comes from the launcher:
// Start-Beta.ps1 sets "beta", Start-LocalTest.ps1 sets "local-test"; plain `node server.mjs` is "local".
const CHANNELS={beta:'Beta',"local-test":'Local test',local:'Local'};
export function buildInfo(version,channel){
 const c=Object.hasOwn(CHANNELS,channel||'')?channel:'local';
 const v=String(version||'0.0.0');
 return {version:v,channel:c,label:`${CHANNELS[c]} · v${v}`};
}
