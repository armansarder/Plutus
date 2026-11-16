/** YAML syntax and project-specific invariants, not a substitute for Render validation. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const yaml=require('js-yaml');
const doc=yaml.load(fs.readFileSync(new URL('../render.yaml',import.meta.url),'utf8'));
assert.equal(doc.services.length,2);
const [api,web]=doc.services;
const env=s=>Object.fromEntries(s.envVars.map(v=>[v.key,v.value??(v.sync===false?'PRIVATE_INPUT':null)]));
for(const service of doc.services){assert.equal(service.type,'web');assert.equal(service.branch,'feature/plutus-v2');assert.equal(service.healthCheckPath,'/health');assert.equal(service.autoDeployTrigger,'off');assert.equal(service.numInstances,1);}
assert.equal(api.runtime,'python');assert.match(api.startCommand,/nemotron_agent.main:app/);assert.match(api.startCommand,/--workers 1/);assert.equal(api.disk.mountPath,'/var/data');assert.equal(env(api).PLUTUS_NOTIFICATIONS_DB,'/var/data/notifications.sqlite3');
assert.equal(env(api).FINPILOT_MODE,'production');assert.equal(env(api).PLUTUS_PUBLIC_DEMO,'1');assert.equal(env(api).PLUTUS_DELIVERY_MODE,'preview');assert.equal(env(api).PLUTUS_PRIVATE_TOOLS,'0');assert.equal(env(api).PLUTUS_RESEARCH_ENABLED,'0');assert.equal(env(api).PLUTUS_SESSION_SECRET,'PRIVATE_INPUT');
assert.equal(web.runtime,'node');assert.equal(web.rootDir,'frontend');assert.equal(web.startCommand,'npm start');assert.equal(env(web).PLUTUS_PUBLIC_ORIGIN,'PRIVATE_INPUT');assert.equal(env(web).PLUTUS_PRIVATE_TOOLS,'0');assert.equal(env(web).PLUTUS_SESSION_SECRET,'PRIVATE_INPUT');
console.log('PASS: Render YAML syntax and Node/Python/public-demo/storage invariants; remote Render validation not performed');
