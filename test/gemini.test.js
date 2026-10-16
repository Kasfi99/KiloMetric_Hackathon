import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Gemini receives current metrics, persists analysis, and handles quota failures without data loss',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fleetwise-ai-'));
 process.env.DATA_FILE=path.join(dir,'fleet.json');process.env.GEMINI_API_KEY='fake-test-key';process.env.DISABLE_GEMINI='0';process.env.FLEETWISE_NO_LISTEN='1';
 const original=globalThis.fetch;let payload;
 globalThis.fetch=async(url,options)=>{assert.match(url,/generativelanguage.googleapis.com/);assert.equal(options.headers['x-goog-api-key'],'fake-test-key');payload=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Sample fleet analysis based on recorded costs.'}]}}]})};};
 try{
  const {handleRequest}=await import('../server.js');
  let cookie='';
  const call=(url,method='GET',payload={})=>new Promise((resolve,reject)=>{
   const req=Readable.from(method==='POST'?[JSON.stringify(payload)]:[]);req.url=url;req.method=method;req.headers={cookie};let status=200;
   handleRequest(req,{writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text)});}}).catch(reject);
  });
  assert.equal((await call('/api/login','POST',{email:'admin@demo.id',password:'demo1234'})).status,200);
  async function waitFor(status){for(let i=0;i<100;i++){const state=(await call('/api/state')).data;if(state.ai.status===status)return state;await new Promise(r=>setTimeout(r,10));}throw new Error(`AI did not reach ${status}`);}
  assert.equal((await call('/api/analyze','POST')).status,202);
  const state=await waitFor('ready');assert.equal(state.ai.revision,state.revision);assert.ok(state.ai.text.includes('Sample fleet'));
  const context=JSON.parse(payload.contents[0].parts[0].text);assert.equal(context.fleetCpk,state.analytics.fleetCpk);assert.equal(context.sampleData,true);assert.ok(context.comparisons.length);
  assert.ok(!JSON.stringify(state).includes('fake-test-key'));
  globalThis.fetch=async()=>({ok:false,status:429});
  assert.equal((await call('/api/analyze','POST')).status,202);
  const failed=await waitFor('error');assert.match(failed.ai.error,/429/);assert.equal(failed.maintenance.length,state.maintenance.length);assert.equal(failed.analytics.totalSpend,state.analytics.totalSpend);
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});
