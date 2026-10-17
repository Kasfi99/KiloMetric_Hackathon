import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {previewRoutes,RESTRICTION_KEYS} from '../lib/routing.js';
import {tripSpecifications} from '../lib/trips.js';

const master={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000};
const reply=(body,ok=true,status=200)=>({ok,status,json:async()=>body});

test('previewRoutes without truck master specs: HGV route, no restrictions sent or claimed, specsMissing warning',async()=>{
 const origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};
 const requests=[];
 const fetcher=async(url,options)=>{
  if(String(url).includes('/geocode/'))return reply({features:[{geometry:{coordinates:[107.1528,-6.2617]},properties:{layer:'venue',label:'Cikarang',confidence:1}}]});
  requests.push(JSON.parse(options.body));
  return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:42000,duration:2520},ascent:1,descent:1},geometry:{type:'LineString',coordinates:[[106.8295,-6.2297],[107.1528,-6.2617]]}}]});
 };
 const {specs}=tripSpecifications({loadKg:4000,hazmat:'flammable'},null);
 const res=await previewRoutes({origin,specs,stops:[{address:'Cikarang'}],lang:'en'},{orsKey:'k',gemini:null,fetcher});
 assert.equal(res.status,200);assert.equal(res.body.routing.provider,'ors');
 assert.ok(requests.length&&requests.every(r=>r.options.vehicle_type==='hgv'&&!('profile_params' in r.options)),'no restrictions without master specs');
 for(const r of res.body.routes){assert.deepEqual(r.restrictions.checked,[]);assert.deepEqual(r.restrictions.unknown,RESTRICTION_KEYS);assert.match(r.warnings[0],/^Truck specifications are not set by your admin yet/);}
 const known=await previewRoutes({origin,specs:tripSpecifications({loadKg:4000,hazmat:'none'},master).specs,stops:[{address:'Cikarang'}],lang:'en'},{orsKey:'k',gemini:null,fetcher});
 assert.deepEqual(requests.at(-1).options.profile_params.restrictions,{height:3.5,width:2.4,length:9,weight:12});
 assert.ok(known.body.routes.every(r=>r.restrictions.checked.includes('height')&&!r.warnings.some(w=>/not set by your admin/.test(w))));
 const id=await previewRoutes({origin,specs,stops:[{address:'Cikarang'}]},{orsKey:'',gemini:null,fetcher});
 assert.ok(id.body.routes.every(r=>r.warnings[0].startsWith('Spesifikasi truk belum diisi admin')),'fixture routes get the warning too');
});

test('truck specifications master: RBAC, validation, spec reports, trips read the master and never write it',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'kilometric-specs-'));
 Object.assign(process.env,{DATA_FILE:path.join(dir,'fleet.json'),DISABLE_GEMINI:'1',DISABLE_ORS:'1',DISABLE_MAPS:'1',FLEETWISE_NO_LISTEN:'1',AI_RATE_LIMIT_PER_MINUTE:'100'});
 try{
  const {handleRequest}=await import('../server.js');
  const client=()=>{let cookie='';return (url,method='GET',body)=>new Promise((resolve,reject)=>{
   const req=Readable.from(body!==undefined?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{cookie}});let status=200;
   handleRequest(req,{writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text)});}}).catch(reject);
  });};
  const [admin,manager,workshop,driver,other]=[client(),client(),client(),client(),client()];
  for(const [call,role] of [[admin,'admin'],[manager,'manager'],[workshop,'workshop'],[driver,'driver']])assert.equal((await call('/api/login','POST',{email:`${role}@demo.id`,password:'demo1234'})).status,200);
  const state=(await admin('/api/state')).data,[t1,t2]=state.trucks;
  assert.deepEqual(t1.specifications,master,'seed keeps sample specs without hazmat');
  const put=(call,id,body)=>call(`/api/trucks/${id}/specifications`,'PUT',body);
  // RBAC and validation
  assert.equal((await put(manager,t1.id,master)).status,403);
  assert.equal((await put(driver,t1.id,master)).status,403);
  assert.equal((await put(admin,'missing',master)).status,404);
  for(const bad of [{...master,heightM:11},{...master,lengthM:0.5},{...master,axles:2.5},{...master,axles:1},{...master,maxGrossKg:8000},{...master,tareKg:''}])assert.equal((await put(admin,t1.id,bad)).status,400,JSON.stringify(bad));
  const saved=await put(workshop,t1.id,{...master,heightM:3.8,hazmat:'none',loadKg:1});
  assert.equal(saved.status,200);assert.deepEqual(saved.data.truck.specifications,{...master,heightM:3.8},'only the six master fields are stored');
  assert.equal((await put(admin,t1.id,{specifications:master})).status,200);
  // A generic truck edit keeps the master specs
  assert.equal((await admin(`/api/trucks/${t1.id}`,'PUT',{...t1})).status,200);
  assert.deepEqual((await admin('/api/state')).data.trucks.find(t=>t.id===t1.id).specifications,master);
  // Spec reports: assigned driver only, note length, hidden from drivers, resolved on save
  const report=(call,id,note)=>call(`/api/trucks/${id}/spec-reports`,'POST',{note});
  assert.equal((await admin('/api/users','POST',{name:'Other driver',email:'other@example.com',role:'driver',active:true,assignedTruckIds:[state.trucks[2].id],password:'OtherDriver!2026'})).status,200);
  assert.equal((await other('/api/login','POST',{email:'other@example.com',password:'OtherDriver!2026'})).status,200);
  assert.equal((await report(other,t2.id,'Height is wrong here')).status,403);
  assert.equal((await report(admin,t2.id,'Height is wrong here')).status,403);
  assert.equal((await report(driver,t2.id,'no')).status,400);
  assert.equal((await report(driver,t2.id,'x'.repeat(301))).status,400);
  assert.deepEqual((await report(driver,t2.id,'  Box is 3.9 m tall, not 3.5  ')).data,{ok:true});
  assert.deepEqual((await report(driver,t2.id,'Width also looks off')).data,{ok:true},'a second report is appended');
  const own=(await driver('/api/state')).data.trucks;
  assert.ok(own.every(t=>!('specReports' in t)),'drivers never see spec reports');
  assert.deepEqual(own.find(t=>t.id===t2.id).specifications,master,'drivers still receive the master specs of their trucks');
  for(const call of [admin,manager,workshop]){const r=(await call('/api/state')).data.trucks.find(t=>t.id===t2.id).specReports;assert.equal(r.length,2);assert.equal(r[0].note,'Box is 3.9 m tall, not 3.5');assert.equal(r[0].resolvedAt,null);assert.equal(r[0].driverName,'Demo driver');}
  // Clearing is a save too: it resolves the open report and leaves the truck without specs
  const cleared=await put(admin,t2.id,{specifications:null});
  assert.equal(cleared.status,200);assert.equal(cleared.data.truck.specifications,null);
  assert.ok(cleared.data.truck.specReports.every(r=>r.resolvedAt&&r.resolvedBy===state.currentUser.id));
  // Trips: client dimensions ignored, master unchanged, source recorded
  const origin=()=>({latitude:-6.2,longitude:106.8,accuracy:10,timestamp:Date.now()});
  const absurd={heightM:9.9,widthM:9.9,lengthM:49,axles:19,tareKg:500,maxGrossKg:250000,loadKg:4000,hazmat:'none'};
  const trip=body=>driver('/api/trips','POST',{destination:'Bandung',specsConfirmed:true,externalRouteConfirmed:true,origin:origin(),...body});
  assert.equal((await trip({truckId:t1.id,startOdometer:t1.odometer,specs:{...absurd,loadKg:13000}})).status,400,'overweight against the master is still rejected');
  const started=await trip({truckId:t1.id,startOdometer:t1.odometer,specs:absurd});
  assert.equal(started.status,200,JSON.stringify(started.data));
  const known=(await driver(`/api/trips/${started.data.tripId}`)).data.trip;
  assert.deepEqual(known.specs,{...master,loadKg:4000,hazmat:'none',grossKg:12000});assert.equal(known.specsSource,'truck');
  assert.deepEqual((await admin('/api/state')).data.trucks.find(t=>t.id===t1.id).specifications,master,'trips never write the truck master');
  assert.equal((await driver(`/api/trips/${started.data.tripId}/complete`,'POST',{endOdometer:t1.odometer+5})).status,200);
  // Missing master: the trip still starts, dimensions null, gross unknown, even a heavy load is accepted
  const preview=await driver('/api/routes/preview','POST',{origin:origin(),specs:{loadKg:4000,hazmat:'none'},stops:[{address:'Bandung'}],truckId:t2.id,lang:'en'});
  assert.equal(preview.status,200);assert.ok(preview.data.routes.every(r=>r.restrictions.checked.length===0&&r.warnings[0].startsWith('Truck specifications are not set')));
  const free=await driver('/api/routes/preview','POST',{origin:origin(),specs:{loadKg:4000,hazmat:'none'},stops:[{address:'Bandung'}],lang:'en'});
  assert.ok(free.data.routes.every(r=>r.warnings[0].startsWith('Truck specifications are not set')),'no truckId → treated as missing specs');
  const blind=await trip({truckId:t2.id,startOdometer:t2.odometer,specs:{loadKg:60000,hazmat:'flammable'}});
  assert.equal(blind.status,200,JSON.stringify(blind.data));
  const missing=(await driver(`/api/trips/${blind.data.tripId}`)).data.trip;
  assert.equal(missing.specsSource,'missing');assert.equal(missing.specs.grossKg,null);
  for(const k of ['heightM','widthM','lengthM','axles','tareKg','maxGrossKg'])assert.equal(missing.specs[k],null);
  assert.equal((await admin('/api/state')).data.trucks.find(t=>t.id===t2.id).specifications,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
