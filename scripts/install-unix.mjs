import {cp, mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export function bridgeConfig(text) {
 const header=/^\[mcp_servers\.puppeteer-bugs-panel\]\r?$/gm;
 if([...text.matchAll(header)].length!==1)throw Error('Expected one native MCP section; restore the preserved configuration backup if needed.');
 return text.replace(/(^\[mcp_servers\.puppeteer-bugs-panel\]\r?\n)([\s\S]*?)(?=^\[|$(?![\s\S]))/m,(_all,h,body)=>h+
  'env_vars = ["CODEX_APP_TOOLS_PIPE_PATH"]\nstartup_timeout_sec = 20\ntool_timeout_sec = 300\n'+
  body.replace(/^(env_vars|startup_timeout_sec|tool_timeout_sec)\s*=.*\r?\n?/gm,''));
}
export async function install() {
 if(!['darwin','linux'].includes(process.platform))throw Error('Use Install-Windows.ps1 on Windows.');
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Node.js 20 or later is required.');
 const flags=process.argv.slice(2);
 if(flags.some(x=>!['--connection-only','--use-checkout'].includes(x)))throw Error('Usage: sh install.sh [--connection-only] [--use-checkout]');
 const run=(exe,args)=>{const r=spawnSync(exe,args,{stdio:'inherit'});if(r.error||r.status!==0)throw Error(`${exe} failed. Ensure Node.js, Git and the Codex CLI are installed and available in PATH.`);};
 run('git',['--version']);run('codex',['--version']);
 const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const base=process.platform==='darwin'?join(homedir(),'Library','Application Support'):process.env.XDG_DATA_HOME||join(homedir(),'.local','share');
 const target=flags.includes('--use-checkout')?source:join(base,'ClickUpTasksPlugin');
 const expectedVersion=JSON.parse(await readFile(join(source,'plugins','puppeteer-bugs','.codex-plugin','plugin.json'),'utf8')).version;
 await mkdir(target,{recursive:true,mode:0o700});
 if(source!==target)for(const dir of ['plugins','.agents'])await cp(join(source,dir),join(target,dir),{recursive:true});
 const config=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'config.toml');
 try {const backup=config+'.before-clickup-tasks-'+randomUUID()+'.bak';await copyFile(config,backup);console.log('Configuration backup: '+backup);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!flags.includes('--connection-only')){
  const marketplaces=spawnSync('codex',['plugin','marketplace','list','--json'],{encoding:'utf8'});
  if(marketplaces.error||marketplaces.status!==0)throw Error('Could not inspect the registered marketplaces.');
  const existing=JSON.parse(marketplaces.stdout).marketplaces.find(m=>m.name==='clickup-tasks-local');
  if(existing&&resolve(existing.root)!==target)run('codex',['plugin','marketplace','remove','clickup-tasks-local','--json']);
  run('codex',['plugin','marketplace','add',target,'--json']);
  run('codex',['plugin','add','puppeteer-bugs@clickup-tasks-local','--json']);
  const result=spawnSync('codex',['plugin','list','--json'],{encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('Could not verify the installed plugin.');
  const installed=JSON.parse(result.stdout).installed.filter(p=>p.pluginId==='puppeteer-bugs@clickup-tasks-local');
  if(installed.length!==1||installed[0].version!==expectedVersion||resolve(installed[0].source.path)!==join(target,'plugins','puppeteer-bugs'))throw Error('Installed plugin version or source does not match this checkout; the configuration backup is preserved.');
  console.log(`Verified ClickUp Tasks ${expectedVersion} from ${installed[0].source.path}`);
 }
 run('codex',['mcp','add','puppeteer-bugs-panel','--',process.execPath,join(target,'plugins','puppeteer-bugs','server','index.mjs')]);
 const text=await readFile(config,'utf8');
 await writeFile(config,bridgeConfig(text),{mode:0o600});
 run('codex',['mcp','get','puppeteer-bugs-panel','--json']);
 console.log(`Installed runtime: ${join(target,'plugins','puppeteer-bugs','server','index.mjs')}`);
 console.log('Restart Codex, open ClickUp Tasks, then choose Setup in the top-right corner.');
 if(flags.includes('--connection-only'))console.log('Connection-only updates the native server only; it does not update the installed plugin version.');
 if(flags.includes('--use-checkout'))console.log('This checkout must remain at its current path. Rerun this command after pulling or rebuilding.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))install().catch(e=>{console.error(e.message);process.exitCode=1;});
