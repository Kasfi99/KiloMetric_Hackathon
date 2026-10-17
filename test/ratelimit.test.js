import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('AI endpoints: 5 calls per minute per user and endpoint, then 429 with Retry-After',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fleetwise-ratelimit-'));
 Object.assign(process.env,{DATA_FILE:path.join(dir,'fleet.json'),DISABLE_GEMINI:'1',DISABLE_ORS:'1',DISABLE_MAPS:'1',FLEETWISE_NO_LISTEN:'1'});
 delete process.env.AI_RATE_LIMIT_PER_MINUTE;
 try{
  const {handleRequest}=await import('../server.js');
  const client=()=>{let cookie='';return (url,method='GET',body)=>new Promise((resolve,reject)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{cookie}});let status=200,headers={};
   handleRequest(req,{writeHead(code,values){status=code;Object.assign(headers,values);},setHeader(name,value){headers[name]=value;if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text),headers});}}).catch(reject);
  });};
  const driver=client(),manager=client();
  await driver('/api/login','POST',{email:'driver@demo.id',password:'demo1234'});await manager('/api/login','POST',{email:'manager@demo.id',password:'demo1234'});
  for(const [call,url] of [[driver,'/api/odometer/read'],[driver,'/api/routes/preview'],[manager,'/api/analyze']]){
   // Invalid bodies still count: the limit protects the AI quota before any work is done.
   for(let i=0;i<5;i++)assert.notEqual((await call(url,'POST',{})).status,429,`${url} call ${i+1} is allowed`);
   const blocked=await call(url,'POST',{});
   assert.equal(blocked.status,429,`${url} 6th call is limited`);assert.match(blocked.data.error,/5 per minute/);
   assert.ok(Number(blocked.headers['retry-after'])>0&&Number(blocked.headers['retry-after'])<=60);
  }
  assert.notEqual((await manager('/api/routes/preview','POST',{})).status,429,'limits are per user and endpoint');
 }finally{await rm(dir,{recursive:true,force:true});}
});
