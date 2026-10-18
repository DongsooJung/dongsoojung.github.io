import {appendFileSync} from 'node:fs';
const base='https://stargate.stargate8225.workers.dev';
if(!process.env.SMS_ADMIN_TOKEN)throw new Error('SMS administrator credential missing');
for(const path of ['/sms/customers/','/sms/analytics/']){const page=await fetch(base+path,{signal:AbortSignal.timeout(15000)});if(!page.ok)throw new Error('Page unavailable: '+path);}
const analytics=await fetch(base+'/api/sms/analytics?days=7',{headers:{'x-admin-token':process.env.SMS_ADMIN_TOKEN},signal:AbortSignal.timeout(20000)});
const stats=await analytics.json();if(!analytics.ok||!stats.ok||stats.source!=='cloudflare'||!Array.isArray(stats.pages))throw new Error('Live analytics query failed');
console.log('Authenticated page-view analytics OK; customer and analytics pages available.');
const denied=await fetch(base+'/api/sms/analytics?days=7',{signal:AbortSignal.timeout(15000)});if(denied.status!==401)throw new Error('Anonymous analytics must be rejected');

const response=await fetch(base+'/api/account',{headers:{'x-admin-token':process.env.SMS_ADMIN_TOKEN},signal:AbortSignal.timeout(35000)});
let data;try{data=await response.json();}catch{throw new Error('Account endpoint did not return JSON');}
// The authenticated handler redacts all runtime secrets. Never print balances or registered sender lists.
if(!response.ok||!data.ok)throw new Error('Live SOLAPI account check failed: HTTP '+response.status+'; '+String(data.message||'No detail').replaceAll(process.env.SMS_ADMIN_TOKEN,'[redacted]').slice(0,240));
const active=data.senders?.includes('01095878225');
const summary=`SOLAPI live verification: API authentication OK; sender 010-9587-8225 ${active?'ACTIVE':'NOT ACTIVE'}; checked ${new Date().toISOString()}. No SMS sent.\n`;
console.log(summary.trim());if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
if(!active)throw new Error('Expected sender is absent from the live active sender list');
