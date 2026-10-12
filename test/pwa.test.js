import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('PWA assets are installable and service worker never intercepts private APIs',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const file=await readFile(new URL('../public'+icon.src,import.meta.url));const size=Number(icon.sizes.split('x')[0]);assert.equal(file.readUInt32BE(16),size);assert.equal(file.readUInt32BE(20),size);}
 const handlers={};let intercepted=false;
 const context={URL,self:{location:{origin:'https://fleet.example'},addEventListener(type,callback){handlers[type]=callback;}},caches:{match:async()=>new Response('offline status')},fetch:async()=>{throw new Error('offline');},Response};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 const event=(pathname,method='GET',mode='cors')=>({request:{url:'https://fleet.example'+pathname,method,mode},respondWith(result){intercepted=true;this.result=result;}});
 for(const [pathname,method] of [['/api/state','GET'],['/api/users','GET'],['/api/trips/trip/locations','POST'],['/api/login','POST']]){intercepted=false;handlers.fetch(event(pathname,method));assert.equal(intercepted,false,'private APIs must remain network-only');}
 const navigation=event('/','GET','navigate');handlers.fetch(navigation);assert.equal(await(await navigation.result).text(),'offline status');
});
