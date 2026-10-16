import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('API handlers: CRUD, validation, CPK recalculation, origin protection, and saved data',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fleetwise-test-'));
 process.env.DATA_FILE=path.join(dir,'fleet.json');process.env.DISABLE_GEMINI='1';process.env.FLEETWISE_NO_LISTEN='1';
 try {
  const {handleRequest}=await import('../server.js');
  let cookie='';
  const call=(url,method='GET',body,origin)=>new Promise((resolve,reject)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers={cookie,...(origin?{origin}:{})};
   let status=200;const res={writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){try{resolve({status,data:JSON.parse(text)});}catch(e){reject(e);}}};
   handleRequest(req,res).catch(reject);
  });
  assert.equal((await call('/api/login','POST',{email:'admin@demo.id',password:'demo1234'})).status,200);
  const initial=(await call('/api/state')).data;assert.equal(initial.trucks.length,6);
  const truck={plate:'TEST 01',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:1000,odometer:3000};
  assert.equal((await call('/api/trucks','POST',truck,'https://evil.example')).status,403);
  assert.equal((await call('/api/trucks','POST',truck)).status,200);
  let state=(await call('/api/state')).data;const id=state.trucks.find(t=>t.plate==='TEST 01').id;
  const visit={truckId:id,date:'2025-06-01',odometer:2000,workshop:'Test workshop',notes:'Labor-only service',labor:500000,otherCost:100000,items:[]};
  assert.equal((await call('/api/maintenance','POST',visit)).status,200);
  state=(await call('/api/state')).data;const m=state.maintenance.find(m=>m.truckId===id);
  assert.equal(state.analytics.trucks.find(t=>t.id===id).cpk,300);
  assert.equal((await call(`/api/trucks/${id}`,'DELETE')).status,400);
  assert.equal((await call(`/api/maintenance/${m.id}`,'PUT',{...visit,labor:700000})).status,200);
  assert.equal((await call(`/api/maintenance/${m.id}`,'PUT',{...visit,odometer:500})).status,400);
  assert.equal((await call('/api/analyze','POST',{})).status,400);
  const persisted=JSON.parse(await readFile(process.env.DATA_FILE,'utf8'));
  assert.equal(persisted.maintenance.find(v=>v.id===m.id).labor,700000);
  assert.equal((await call('/api/state')).data.analytics.trucks.find(t=>t.id===id).cpk,400);
  assert.equal((await call(`/api/maintenance/${m.id}`,'DELETE')).status,200);
  assert.equal((await call(`/api/trucks/${id}`,'DELETE')).status,200);
  const part={name:'Test part',brand:'Test',category:'Filters',sku:'TEST-01',price:100000,models:['Hino 500']};
  assert.equal((await call('/api/parts','POST',part)).status,200);
  state=(await call('/api/state')).data;const p=state.parts.find(p=>p.sku==='TEST-01');
  assert.equal((await call(`/api/parts/${p.id}`,'PUT',{...part,price:200000})).status,200);
  assert.equal((await call(`/api/parts/${p.id}`,'DELETE')).status,200);
  assert.equal((await call('/api/state')).data.analytics.totalSpend,initial.analytics.totalSpend);
  assert.equal(JSON.parse(await readFile(process.env.DATA_FILE,'utf8')).trucks.length,6);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('mobile login returns a bearer token that authenticates without cookies',async()=>{
 const {handleRequest}=await import('../server.js');
 const call=(url,method='GET',body,headers={})=>new Promise((resolve,reject)=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers={...headers};
  let status=200,setCookie=null;const res={writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')setCookie=value;},end(text){try{resolve({status,data:JSON.parse(text),setCookie});}catch(e){reject(e);}}};
  handleRequest(req,res).catch(reject);
 });
 const login=await call('/api/login','POST',{email:'driver@demo.id',password:'demo1234',client:'mobile'});
 assert.equal(login.status,200);assert.match(login.data.token,/^[a-f0-9]{64}$/);assert.equal(login.setCookie,null,'mobile login must not set a cookie');
 assert.equal((await call('/api/state')).status,401);
 const state=await call('/api/state','GET',undefined,{authorization:`Bearer ${login.data.token}`});
 assert.equal(state.status,200);assert.equal(state.data.currentUser.role,'driver');
 assert.deepEqual(state.data.orders.map(o=>o.reference),['DO-DEMO-001','DO-DEMO-002','DO-DEMO-003'],'fresh demo database seeds assigned demo orders');
 assert.ok(state.data.orders.every(o=>o.status==='assigned'&&!('source' in o)));
 assert.equal((await call('/api/state','GET',undefined,{authorization:'Bearer deadbeef'})).status,401);
 assert.equal((await call('/api/logout','POST',undefined,{authorization:`Bearer ${login.data.token}`})).status,200);
 assert.equal((await call('/api/state','GET',undefined,{authorization:`Bearer ${login.data.token}`})).status,401,'logout must revoke the bearer token');
 const web=await call('/api/login','POST',{email:'driver@demo.id',password:'demo1234'});
 assert.equal(web.status,200);assert.equal(web.data.token,undefined);assert.match(web.setCookie,/^fleetwise_session=/);
});
