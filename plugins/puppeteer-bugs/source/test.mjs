import {spawnSync} from 'node:child_process';
const suites=['test-package.mjs','test-session-routing.mjs','test-direct-launch.mjs','test-lifecycle.mjs','test-investigation.mjs','test-review.mjs','test-finish.mjs','test-filters.mjs','test-git.mjs','test-work-modes.mjs','test-portable.mjs','test-recovery.mjs'];
for(const suite of suites){const result=spawnSync(process.execPath,['--import','./test-config.mjs',suite],{stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log('All portable plugin tests passed.');
