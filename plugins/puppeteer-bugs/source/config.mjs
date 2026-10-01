export const VERSION='0.12.1';
const defaults={workspaceId:'',spaceId:'',spaceName:'',listId:'',listName:'',projectId:'',projectName:'',hostId:'local',repositoryPath:'',repositoryUrl:'',repositorySlug:'',baseBranch:'main',clickupUrl:'',configured:false};
export const SCOPE={...defaults};
export function configureScope(value){for(const key of Object.keys(SCOPE))delete SCOPE[key];Object.assign(SCOPE,defaults,value||{});}
export function requireSetup(){if(!SCOPE.configured)throw Error('Open Setup and connect your ClickUp project and GitHub repository first.');}
