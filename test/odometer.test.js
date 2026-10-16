import {test} from 'node:test';
import assert from 'node:assert/strict';
import {photoInput,readOdometer,compareOdometer,consumeCheck,MAX_PHOTO_BYTES} from '../lib/odometer.js';

const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4]).toString('base64');
const reply=(data,ok=true,status=ok?200:500)=>({ok,status,json:async()=>data});
const gemini=obj=>reply({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(obj)}]}}]});

test('photoInput: accepts camera images up to 3 MiB, hashes them, rejects other files',()=>{
 const p=photoInput({mimeType:'image/jpeg',data:jpeg});
 assert.equal(p.mimeType,'image/jpeg');assert.equal(p.bytes.length,8);assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.equal(p.ext,'jpg');
 assert.throws(()=>photoInput({mimeType:'application/pdf',data:jpeg}),/photo/i);
 assert.throws(()=>photoInput({mimeType:'image/jpeg',data:''}),/photo/i);
 assert.throws(()=>photoInput({mimeType:'image/png',data:Buffer.alloc(MAX_PHOTO_BYTES+1).toString('base64')}),/3 MiB/);
});

test('readOdometer: Gemini vision with a schema; failures become unavailable, never a guessed number',async()=>{
 let body;
 const ok=await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'g',model:'m',fetcher:async(url,o)=>{body=JSON.parse(o.body);return gemini({readingKm:158060,legible:true,unit:'km',notes:''});}});
 assert.deepEqual(ok,{status:'read',readingKm:158060,unit:'km',model:'m',reason:null});
 assert.equal(body.contents[0].parts.find(p=>p.inlineData).inlineData.mimeType,'image/jpeg');
 assert.equal(body.generationConfig.responseMimeType,'application/json');assert.match(body.systemInstruction.parts[0].text,/trip meter/i);
 assert.equal((await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'g',model:'m',fetcher:async()=>gemini({readingKm:null,legible:false,unit:'unknown',notes:'blurry'})})).status,'unreadable');
 assert.equal((await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'g',model:'m',fetcher:async()=>gemini({readingKm:-5,legible:true,unit:'km',notes:''})})).status,'unreadable','nonsense numbers are not trusted');
 const credits=await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'g',model:'m',fetcher:async()=>reply({},false,402)});
 assert.deepEqual([credits.status,credits.readingKm],['unavailable',null]);assert.match(credits.reason,/credits/);
 assert.equal((await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'',model:'m',fetcher:async()=>{throw new Error('no call');}})).status,'unavailable');
 assert.equal((await readOdometer(photoInput({mimeType:'image/jpeg',data:jpeg}),{apiKey:'g',model:'m',fetcher:async()=>reply({candidates:[{content:{parts:[{text:'nope'}]}}]})})).status,'unavailable');
});

test('compareOdometer: match within 1 km, else mismatch; unreadable/unavailable pass through',()=>{
 assert.equal(compareOdometer(158060,{status:'read',readingKm:158060}),'match');
 assert.equal(compareOdometer(158060,{status:'read',readingKm:158061}),'match');
 assert.equal(compareOdometer(158060,{status:'read',readingKm:158080}),'mismatch');
 assert.equal(compareOdometer(158060,{status:'unreadable',readingKm:null}),'unreadable');
 assert.equal(compareOdometer(158060,{status:'unavailable',readingKm:null}),'unavailable');
});

test('consumeCheck: owner, stage and typed value must match; mismatch/unreadable need a reason',()=>{
 const check={userId:'u1',stage:'end',typedKm:158060,status:'mismatch',ocrKm:158600,model:'m',sha256:'a'.repeat(64),ext:'jpg',at:'2026-10-17T00:00:00.000Z'};
 assert.throws(()=>consumeCheck(undefined,{userId:'u1',stage:'end',typedKm:158060}),/photo check/i);
 assert.throws(()=>consumeCheck(check,{userId:'u2',stage:'end',typedKm:158060,note:'gauge blurred'}),/photo check/i);
 assert.throws(()=>consumeCheck(check,{userId:'u1',stage:'start',typedKm:158060,note:'gauge blurred'}),/photo check/i);
 assert.throws(()=>consumeCheck(check,{userId:'u1',stage:'end',typedKm:158070,note:'gauge blurred'}),/changed/);
 assert.throws(()=>consumeCheck(check,{userId:'u1',stage:'end',typedKm:158060,note:'no'}),/explain/i);
 const evidence=consumeCheck(check,{userId:'u1',stage:'end',typedKm:158060,note:'  Photo taken at an angle  ',photo:'trip-end.jpg'});
 assert.deepEqual(evidence,{status:'mismatch',typedKm:158060,ocrKm:158600,note:'Photo taken at an angle',model:'m',sha256:'a'.repeat(64),photo:'trip-end.jpg',checkedAt:'2026-10-17T00:00:00.000Z'});
 assert.equal(consumeCheck({...check,status:'match'},{userId:'u1',stage:'end',typedKm:158060,photo:'p.jpg'}).note,null,'no reason needed when it matches');
 assert.equal(consumeCheck({...check,status:'unavailable',ocrKm:null},{userId:'u1',stage:'end',typedKm:158060,photo:'p.jpg'}).status,'unavailable','OCR outage does not block the driver');
});
