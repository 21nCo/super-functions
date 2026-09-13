import { readFileSync, writeFileSync } from 'node:fs';
const [url, tokenFile, output] = process.argv.slice(2);
if (!url || !tokenFile || !output) throw new Error('Usage: node scripts/sfns4/run-hosted-hyperdrive.mjs https://<owned-worker>/run <private-token-file> <evidence-json>');
const endpoint = new URL(url);
if (endpoint.protocol !== 'https:' || !endpoint.hostname.startsWith('sfns-4-')) throw new Error('Use the owned HTTPS canary Worker');
const token = readFileSync(tokenFile,'utf8').trim();
const negative = await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(30000)});
if (negative.status !== 403) throw new Error(`Unauthenticated endpoint returned ${negative.status}`);
async function run() {
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(180000)});
  const body=await response.json();
  return {status:response.status,...body};
}
const first=await run();
const runs=[first];
if(first.ok) {
  runs.push(await run());
  if(runs[1].ok) runs.push(...await Promise.all([run(),run()]));
}
const evidence={timestamp:new Date().toISOString(),url:endpoint.href,unauthenticatedStatus:negative.status,runs,ok:runs.length===4 && runs.every(r=>r.status===200&&r.ok)};
writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
if(!evidence.ok)process.exitCode=1;
