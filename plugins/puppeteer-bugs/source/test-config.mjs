import {resolve} from 'node:path';
import {configureScope} from './config.mjs';
configureScope({configured:true,workspaceId:'11001',spaceId:'22001',spaceName:'Programming',listId:'33001',listName:'Bugs',projectId:'fixture-project',projectName:'ExampleProject',hostId:'local',repositoryPath:resolve('fixture-repository'),repositorySlug:'example-owner/ExampleProject',repositoryUrl:'https://github.com/example-owner/ExampleProject.git',baseBranch:'develop'});
