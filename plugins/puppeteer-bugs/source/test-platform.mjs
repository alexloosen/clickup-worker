import assert from 'node:assert/strict';
import {mkdtemp,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dataDirectory,normalizePath} from './platform.mjs';
import {Credentials} from './credentials.mjs';
import {bridgeConfig} from '../../../scripts/install-unix.mjs';
assert.equal(normalizePath('C:/Repo','win32'),normalizePath('c:/repo/','win32'));
assert.notEqual(normalizePath('/work/Repo','linux'),normalizePath('/work/repo','linux'));
assert.equal(dataDirectory('linux',{},'/home/test'),join('/home/test','.local','share','ClickUpTasks'));
assert.equal(dataDirectory('linux',{XDG_DATA_HOME:'/data'},'/home/test'),join('/data','ClickUpTasks'));
assert.equal(dataDirectory('darwin',{},'/Users/test'),join('/Users/test','Library','Application Support','ClickUpTasks'));
assert.equal(dataDirectory('linux',{PUPPETEER_BUGS_DATA_DIR:'/explicit'},'/home/test'),'/explicit');
const base='approval_policy = "on-request"\n[mcp_servers.other]\ncommand = "untouched"\n[mcp_servers.puppeteer-bugs-panel]\ncommand = "node"\nenv_vars = ["OLD"]\ntool_timeout_sec = 1\n[mcp_servers.puppeteer-bugs-panel.env]\nOTHER = "keep"\n';
const patched=bridgeConfig(base);
assert.equal(bridgeConfig(patched),patched);
assert.ok(patched.startsWith('approval_policy = "on-request"\n[mcp_servers.other]\ncommand = "untouched"\n'));
assert.ok(patched.includes('[mcp_servers.puppeteer-bugs-panel.env]\nOTHER = "keep"'));
assert.equal((patched.match(/env_vars =/g)||[]).length,1);
assert.ok(patched.includes('CODEX_APP_TOOLS_PIPE_PATH'));
assert.throws(()=>bridgeConfig(''),/Expected one/);
const dir=await mkdtemp(join(tmpdir(),'clickup-platform-')),c=new Credentials(dir),token='pk_synthetic_platform_test_only';
await c.save(token);assert.equal(await c.get(),token);assert.equal(await c.configured(),true);
await c.save(token+'2');assert.equal(await c.get(),token+'2');
if(process.platform==='win32'){assert.ok(!(await readFile(c.file,'utf8')).includes(token));}
else {assert.equal((await stat(c.file)).mode&0o777,0o600);assert.equal((await stat(dir)).mode&0o777,0o700);}
await c.remove();assert.equal(await c.configured(),false);
console.log('PASS: platform paths, private token storage, credential replacement/removal, idempotent bridge config preserving unrelated settings.');
