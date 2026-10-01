import {SCOPE} from './config.mjs';
export const PR_URL_PATTERN=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/;
export const safePr=(url,scope=SCOPE)=>typeof url==='string'&&PR_URL_PATTERN.test(url)&&url.split('/').slice(3,5).join('/').toLowerCase()===String(scope.repositorySlug||'').toLowerCase();
export function repositorySlug(value){
 if(typeof value!=='string')throw Error('Enter a GitHub repository URL.');
 const match=value.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
 if(!match||['.','..'].includes(match[1])||['.','..'].includes(match[2]))throw Error('Use a github.com repository URL without credentials, query parameters or extra paths.');
 return match[1]+'/'+match[2];
}
