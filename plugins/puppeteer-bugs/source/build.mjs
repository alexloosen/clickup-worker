import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const target='../server';
await mkdir(target,{recursive:true});
await build({entryPoints:['server.mjs'],outfile:`${target}/index.mjs`,bundle:true,platform:'node',format:'esm',target:'node20',banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'}});
const app=await build({entryPoints:['app.mjs'],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',minify:true});
const html=(await readFile('board.html','utf8')).replace('<script>/* APP_SCRIPT */</script>',()=>`<script type="module">${app.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
await writeFile(`${target}/board.html`,html);
console.log('Built self-contained server and board.');
await writeFile(`${target}/protect.ps1`, await readFile('protect.ps1'));


