import {mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dest=fileURLToPath(new URL('./public/',import.meta.url));
mkdirSync(dest+'assets',{recursive:true});
copyFileSync(root+'sms/index.html',dest+'index.html');
for(const file of ['theme-boot.js','theme.js','intelligence-hub.css']) copyFileSync(root+'assets/'+file,dest+'assets/'+file);
console.log('SMS public assets prepared');
