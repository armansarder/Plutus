/** Free-profile budget/security invariants; no remote Render validation. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const doc=require('js-yaml').load(fs.readFileSync(new URL('../render.free.yaml',import.meta.url),'utf8'));
assert.equal(doc.services.length,2);
assert.equal(doc.databases,undefined);
const [api,web]=doc.services;
const env=s=>Object.fromEntries(s.envVars.map(v=>[v.key,v.value??(v.sync===false?'PRIVATE_INPUT':null)]));
for(const s of doc.services){assert.equal(s.plan,'free');assert.equal(s.disk,undefined);assert.equal(s.type,'web');assert.equal(s.autoDeployTrigger,'off');assert.equal(s.healthCheckPath,'/health');assert.equal(env(s).PLUTUS_PRIVATE_TOOLS,'0');assert.equal(env(s).PLUTUS_SESSION_SECRET,'PRIVATE_INPUT');}
assert.equal(api.runtime,'python');assert.match(api.startCommand,/--workers 1/);
for(const [key,value] of Object.entries({FINPILOT_MODE:'production',PLUTUS_PUBLIC_DEMO:'1',PLUTUS_DATA_MODE:'demo',FINPILOT_DATA_SOURCE:'mock',AGENT_DATA_SOURCE:'demo',PLUTUS_DELIVERY_MODE:'preview',PLUTUS_ALERT_POLL_SECONDS:'0',PLUTUS_RESEARCH_ENABLED:'0',PHOTON_RECIPIENT_OPTED_IN:'false',NVIDIA_API_KEY:'',PLUTUS_NOTIFICATIONS_DB:'/tmp/plutus-demo/notifications.sqlite3'}))assert.equal(env(api)[key],value,key);
assert.equal(web.runtime,'node');assert.equal(web.rootDir,'frontend');assert.equal(web.startCommand,'npm start');assert.equal(env(web).PLUTUS_PUBLIC_ORIGIN,'PRIVATE_INPUT');
console.log('PASS: separate Free Node/Python profile; no paid disk/database/provider requirement');
