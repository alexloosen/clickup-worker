import {join,resolve,win32,posix} from 'node:path';
import {homedir} from 'node:os';
export function dataDirectory(platform=process.platform,env=process.env,home=homedir()){
 if(env.PUPPETEER_BUGS_DATA_DIR||env.PLUGIN_DATA)return env.PUPPETEER_BUGS_DATA_DIR||env.PLUGIN_DATA;
 if(platform==='win32')return join(env.LOCALAPPDATA||join(home,'AppData','Local'),'ClickUpTasks');
 if(platform==='darwin')return join(home,'Library','Application Support','ClickUpTasks');
 return join(env.XDG_DATA_HOME||join(home,'.local','share'),'ClickUpTasks');
}
export function normalizePath(value,platform=process.platform){
 if(!value)return '';
 return platform==='win32'?win32.resolve(value).toLowerCase():posix.resolve(value);
}
export const samePath=(a,b)=>normalizePath(a)===normalizePath(b);
