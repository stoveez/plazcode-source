import fs from 'node:fs/promises';
import {build} from 'esbuild';
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/server',{recursive:true});await fs.mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,legalComments:'linked'});
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');await fs.cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built Sites Worker ESM artifact with account-service migrations.');
