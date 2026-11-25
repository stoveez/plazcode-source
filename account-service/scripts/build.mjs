import fs from 'node:fs/promises';
import {build} from 'esbuild';
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/server',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
try{await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');}catch{}
await fs.cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built account-service Worker ESM bundle with migrations.');
