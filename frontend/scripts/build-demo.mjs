import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'build'],{
 cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,NODE_ENV:'production',VITE_DATA_MODE:'remote',VITE_SITUATION_DATA_MODE:'remote',VITE_COUNCIL_ENABLED:'true'},stdio:'inherit'});
process.exit(result.status??1);
