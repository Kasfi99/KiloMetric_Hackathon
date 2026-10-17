import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sections=[{title:'Fleet summary',bullets:['Sample fleet analysis based on recorded costs.','**B 9123 KX** has the highest CPK.']},{title:'Best observed mix by model and profile',bullets:['**Bridgestone** leads tires on Hino 500 regional haul (3 cycles).']},{title:'Evidence gaps',bullets:['Brakes have one completed cycle.']},{title:'Next actions',bullets:['Ask the workshop to approve fitment.']}];
const reply=(text,finishReason='STOP')=>({ok:true,json:async()=>({candidates:[{finishReason,content:{parts:[{text}]}}]})});
test('Gemini receives current metrics, persists structured analysis, and handles quota and format failures without data loss',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fleetwise-ai-'));
 process.env.DATA_FILE=path.join(dir,'fleet.json');process.env.GEMINI_API_KEY='fake-test-key';process.env.DISABLE_GEMINI='0';process.env.FLEETWISE_NO_LISTEN='1';process.env.AI_RATE_LIMIT_PER_MINUTE='20';
 const original=globalThis.fetch;let payload;
 globalThis.fetch=async(url,options)=>{assert.match(url,/generativelanguage.googleapis.com/);assert.equal(options.headers['x-goog-api-key'],'fake-test-key');payload=JSON.parse(options.body);return reply(JSON.stringify({sections}));};
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
  assert.deepEqual(state.ai.sections,sections);assert.equal(state.ai.text.split('\n\n')[0],'Fleet summary\n- Sample fleet analysis based on recorded costs.\n- **B 9123 KX** has the highest CPK.');
  assert.equal(payload.generationConfig.responseMimeType,'application/json');assert.equal(payload.generationConfig.responseSchema.properties.sections.type,'ARRAY');assert.equal(payload.generationConfig.maxOutputTokens,8192);assert.match(payload.systemInstruction.parts[0].text,/license plate/);
  const context=JSON.parse(payload.contents[0].parts[0].text);assert.equal(context.fleetCpk,state.analytics.fleetCpk);assert.equal(context.sampleData,true);assert.ok(context.comparisons.length);
  assert.ok(!JSON.stringify(state).includes('fake-test-key'));
  globalThis.fetch=async()=>({ok:false,status:429});
  assert.equal((await call('/api/analyze','POST')).status,202);
  const failed=await waitFor('error');assert.match(failed.ai.error,/429/);assert.equal(failed.maintenance.length,state.maintenance.length);assert.equal(failed.analytics.totalSpend,state.analytics.totalSpend);
  // Invalid or truncated JSON, and JSON outside the limits, are errors; the previous analysis stays.
  for(const [text,finish,message] of [['{"sections":[{"title":"Fleet summary","bullets":["Cut','MAX_TOKENS',/cut off/],['Plain text, not JSON','STOP',/unexpected format/],[JSON.stringify({sections:[{title:'',bullets:['x']}]}),'STOP',/unexpected format/],[JSON.stringify({sections:[{title:'Fleet summary',bullets:['x'.repeat(601)]}]}),'STOP',/unexpected format/],[JSON.stringify({sections:Array(9).fill(sections[0])}),'STOP',/unexpected format/]]){
   let called=false;globalThis.fetch=async()=>{called=true;return reply(text,finish);};
   assert.equal((await call('/api/analyze','POST')).status,202);
   let bad;for(let i=0;i<100;i++){bad=(await call('/api/state')).data;if(called&&bad.ai.status==='error')break;await new Promise(r=>setTimeout(r,10));}
   assert.match(bad.ai.error,message);assert.deepEqual(bad.ai.sections,sections);assert.equal(bad.ai.text,state.ai.text);assert.equal(bad.ai.updatedAt,state.ai.updatedAt);
  }
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});
