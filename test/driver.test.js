import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {tripSpecifications,masterSpecifications,storedSpecifications,locationPoint,addLocations,haversine,createTrip,routePlanSnapshot} from '../lib/trips.js';
import {hashPassword,verifyPassword,demoUsers,demoEmail,DEMO_PASSWORD,migrateLegacyDemoAccounts} from '../lib/auth.js';

test('demo accounts: short credentials, and untouched legacy demo accounts migrate to them',()=>{
 const fresh=demoUsers([{id:'t1'},{id:'t2'}]);
 assert.deepEqual(fresh.map(u=>u.email),['admin@demo.id','manager@demo.id','workshop@demo.id','driver@demo.id']);
 assert.ok(fresh.every(u=>verifyPassword(DEMO_PASSWORD,u.passwordHash)));assert.equal(DEMO_PASSWORD,'demo1234');assert.equal(demoEmail('driver'),'driver@demo.id');
 const legacy=[
  {role:'admin',email:'admin@fleetwise.local',passwordHash:hashPassword('FleetwiseDemo!2026')},
  {role:'driver',email:'driver@fleetwise.local',passwordHash:hashPassword('FleetwiseDemo!2026')},
  {role:'manager',email:'manager@fleetwise.local',passwordHash:hashPassword('Changed-by-admin!1')},
  {role:'driver',email:'second@example.com',passwordHash:hashPassword('FleetwiseDemo!2026')},
 ];
 assert.equal(migrateLegacyDemoAccounts(legacy),2);
 assert.deepEqual(legacy.map(u=>u.email),['admin@demo.id','driver@demo.id','manager@fleetwise.local','second@example.com'],'only demo-named accounts that still use the public password move');
 assert.ok(verifyPassword('demo1234',legacy[1].passwordHash));assert.ok(verifyPassword('Changed-by-admin!1',legacy[2].passwordHash),'a changed password is never reset');
 assert.equal(migrateLegacyDemoAccounts(legacy),0,'idempotent');
});

const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:8000,hazmat:'none'};
test('password hashes, truck load validation, and GPS quality checks',()=>{
 const hash=hashPassword('test-password');assert.notEqual(hash,'test-password');assert.ok(verifyPassword('test-password',hash));assert.ok(!verifyPassword('wrong',hash));
 const master={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000};
 assert.equal(tripSpecifications({loadKg:8000,hazmat:'none'},master).specs.grossKg,16000);
 assert.throws(()=>tripSpecifications({loadKg:13000,hazmat:'none'},master),/exceed/);
 assert.throws(()=>tripSpecifications({loadKg:1,hazmat:'nuclear'},master),/hazardous/);
 assert.throws(()=>masterSpecifications({...master,heightM:''}),/height/);
 assert.throws(()=>masterSpecifications({...master,axles:2.5}),/whole/);
 assert.throws(()=>masterSpecifications({...master,maxGrossKg:8000}),/above/);
 assert.deepEqual(tripSpecifications({...specs,heightM:99,tareKg:1},master).specs,{...master,loadKg:8000,hazmat:'none',grossKg:16000},'client dimensions are ignored');
 const missing=tripSpecifications({loadKg:50000,hazmat:'flammable'},null);
 assert.equal(missing.source,'missing');assert.equal(missing.specs.grossKg,null);assert.equal(missing.specs.heightM,null);assert.equal(missing.specs.loadKg,50000);
 assert.deepEqual(storedSpecifications({...master,loadKg:1,hazmat:'none',grossKg:8001}),master,'legacy trip fields are dropped');
 assert.equal(storedSpecifications({heightM:'x'}),null);
 assert.throws(()=>locationPoint({latitude:-6,longitude:106,accuracy:500,timestamp:Date.now()}),/accuracy/);
 assert.throws(()=>locationPoint({latitude:-6,longitude:106,accuracy:5,timestamp:Date.now()-180000},{fresh:true}),/stale/);
 const p={latitude:-6,longitude:106,accuracy:5,timestamp:Date.now()-60000};
 const trip={startedAt:new Date(p.timestamp).toISOString(),points:[p],gpsDistanceKm:0};
 assert.equal(addLocations(trip,[p]),0,'replayed GPS point must not add distance');
 assert.throws(()=>addLocations(trip,[{...p,latitude:-5,timestamp:p.timestamp+1000}]),/implausible/);
 assert.equal(trip.points.length,1);assert.equal(haversine(p,p),0);
});

test('login, server-side RBAC, driver isolation, trip lifecycle and odometer CPK updates',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fleetwise-driver-'));
 process.env.DATA_FILE=path.join(dir,'fleet.json');process.env.DISABLE_GEMINI='1';process.env.DISABLE_ORS='1';process.env.DISABLE_MAPS='1';process.env.FLEETWISE_NO_LISTEN='1';
 try{
  const {handleRequest}=await import('../server.js');
  function client(){let cookie='';return (url,method='GET',body)=>new Promise((resolve,reject)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{cookie}});let status=200,headers={};
   handleRequest(req,{writeHead(code,values){status=code;Object.assign(headers,values);},setHeader(name,value){headers[name]=value;if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text),headers});}}).catch(reject);
  });}
  const driver=client(),admin=client(),manager=client(),workshop=client(),other=client();
  assert.equal((await driver('/api/state')).status,401);
  assert.equal((await driver('/api/trips','POST',{})).status,401);
  assert.equal((await driver('/api/login','POST',{email:'driver@demo.id',password:'wrong'})).status,401);
  const login=async(call,role)=>call('/api/login','POST',{email:`${role}@demo.id`,password:'demo1234'});
  const signed=await login(driver,'driver');assert.equal(signed.status,200);assert.ok(signed.headers['set-cookie'].includes('HttpOnly'));assert.ok(signed.headers['set-cookie'].includes('SameSite=Strict'));
  await login(admin,'admin');await login(manager,'manager');await login(workshop,'workshop');
  const initial=(await admin('/api/state')).data,own=(await driver('/api/state')).data;
  assert.equal(own.trucks.length,2);assert.ok(!JSON.stringify(own).includes('passwordHash'));assert.ok(!('users' in initial));
  assert.equal((await driver('/api/parts','POST',{})).status,403);
  assert.equal((await driver('/api/users')).status,403);
  assert.equal((await manager('/api/users')).status,403);
  assert.equal((await workshop('/api/analyze','POST',{})).status,403);
  const origin={latitude:-6.2,longitude:106.8,accuracy:10,timestamp:Date.now()-30000};
  const input={truckId:own.trucks[0].id,startOdometer:own.trucks[0].odometer+100,destination:'Customer warehouse, Bandung',specs,specsConfirmed:true,externalRouteConfirmed:true,origin,driverId:'forged-driver'};
  assert.equal((await driver('/api/trips','POST',{...input,truckId:initial.trucks[2].id})).status,400);
  assert.equal((await driver('/api/trips','POST',{...input,specs:{...specs,loadKg:13000}})).status,400);
  assert.equal((await driver('/api/trips','POST',{...input,specsConfirmed:false})).status,400);
  // No ORS key in tests: preview returns clearly labelled fixture candidates, never an unlabelled route.
  const route=await driver('/api/routes/preview','POST',{...input,stops:[{address:input.destination}]});assert.equal(route.status,200);assert.equal(route.data.routing.provider,'fixture');assert.ok(route.data.routes.every(r=>r.warnings.some(w=>/contoh/.test(w))));
  const started=await driver('/api/trips','POST',input);assert.equal(started.status,200);const tripId=started.data.tripId;
  assert.equal((await driver('/api/trips','POST',input)).status,400);
  assert.equal((await manager('/api/trips','POST',input)).status,403);
  const trip=(await driver(`/api/trips/${tripId}`)).data.trip;assert.equal(trip.driverId,own.currentUser.id);assert.equal(trip.specs.grossKg,16000);assert.equal(trip.routing.priority,'fastest');assert.equal(trip.routing.tollsAllowed,true);assert.equal(trip.routing.status,'not_connected');
  assert.equal(trip.maintenanceCpkAtStart,own.analytics.trucks[0].spend/(input.startOdometer-own.trucks[0].baselineOdometer));
  assert.equal((await workshop(`/api/trips/${tripId}`)).status,403);
  assert.equal((await manager(`/api/trips/${tripId}`)).status,200);
  assert.equal((await admin('/api/users','POST',{name:'Second driver',email:'second@example.com',role:'driver',active:true,assignedTruckIds:[initial.trucks[1].id],password:'AnotherDemo!2026'})).status,200);
  await other('/api/login','POST',{email:'second@example.com',password:'AnotherDemo!2026'});
  assert.equal((await other(`/api/trips/${tripId}`)).status,403);
  assert.equal((await other(`/api/trips/${tripId}/locations`,'POST',{points:[origin]})).status,403);
  assert.equal((await other('/api/state')).data.trips.length,0);
  const point={...origin,latitude:-6.199,timestamp:Date.now()-10000};
  assert.equal((await driver(`/api/trips/${tripId}/locations`,'POST',{points:[point]})).data.accepted,1);
  assert.equal((await driver(`/api/trips/${tripId}/locations`,'POST',{points:[point]})).data.accepted,0);
  assert.equal((await driver(`/api/trips/${tripId}/complete`,'POST',{endOdometer:input.startOdometer-1})).status,400);
  assert.equal((await driver(`/api/trips/${tripId}/complete`,'POST',{endOdometer:input.startOdometer+10})).status,200);
  const finished=(await driver(`/api/trips/${tripId}`)).data.trip;
  assert.equal(finished.odometerDistanceKm,10);assert.ok(finished.gpsDistanceKm<1);assert.equal(finished.estimatedMaintenanceCost,finished.maintenanceCpkAtStart*10);
  assert.equal((await driver(`/api/trips/${tripId}/locations`,'POST',{points:[point]})).status,400);
  const updated=(await admin('/api/state')).data;assert.equal(updated.trucks.find(t=>t.id===input.truckId).odometer,input.startOdometer+10);assert.equal(updated.analytics.totalSpend,initial.analytics.totalSpend);
  const users=(await admin('/api/users')).data.users;assert.ok(users.every(u=>!u.passwordHash));
  const adminUser=users.find(u=>u.role==='admin');
  assert.equal((await admin(`/api/users/${adminUser.id}`,'PUT',{...adminUser,role:'driver'})).status,400,'last admin cannot be demoted');
  const driverUser=users.find(u=>u.role==='driver'&&u.email==='driver@demo.id');
  assert.equal((await admin(`/api/users/${driverUser.id}`,'PUT',{...driverUser,active:false})).status,200);
  assert.equal((await driver('/api/state')).status,401,'disabled users lose their existing session');
  const persisted=JSON.parse(await readFile(process.env.DATA_FILE,'utf8'));assert.equal(persisted.trips.find(t=>t.id===tripId).status,'completed');assert.ok(persisted.users.every(u=>u.passwordHash));
  await manager('/api/logout','POST',{});assert.equal((await manager('/api/state')).status,401);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('routePlan snapshot: validated, stored on trip.routing, optional',()=>{
 const plan={routeId:'ors-1',provider:'ors',distanceKm:152,durationMin:150,polyline:[[-6.2297,106.8295],[-6.9147,107.6098]],restrictions:{checked:['height'],unknown:['truck_bans']},explanation:{recommendedRouteId:'ors-1',headline:'Tercepat'},wasRecommended:true,chosenAt:new Date().toISOString()};
 assert.deepEqual(routePlanSnapshot(plan),plan);
 // Route cost and road condition from the preview travel with the plan (optional; numbers or null).
 const priced={...plan,cost:{maintenanceCost:16800,fuelCost:68000,tollCost:null,totalCost:84800,tripCpk:2120,tollIncluded:false,roughRoadFactor:1.5,factorApplied:true},roadCondition:{pavedKm:36,roughKm:4,unknownKm:0,steepKm:0,ferryKm:0}};
 assert.deepEqual(routePlanSnapshot(priced),priced);
 assert.throws(()=>routePlanSnapshot({...priced,cost:{...priced.cost,totalCost:'lots'}}),/cost/i);
 assert.throws(()=>routePlanSnapshot({...priced,roadCondition:{...priced.roadCondition,roughKm:-1}}),/road condition/i);
 assert.equal(routePlanSnapshot({...priced,cost:{...priced.cost,extra:'x'}}).cost.extra,undefined,'unknown fields are dropped');
 assert.equal(routePlanSnapshot(undefined),null);
 assert.deepEqual(routePlanSnapshot({...plan,explanation:null}).explanation,null);
 assert.throws(()=>routePlanSnapshot({...plan,provider:'google'}),/provider/i);
 assert.throws(()=>routePlanSnapshot({...plan,polyline:[[-6,'x']]}),/polyline/i);
 assert.throws(()=>routePlanSnapshot({...plan,distanceKm:0}),/distance/i);
 assert.throws(()=>routePlanSnapshot({...plan,restrictions:{checked:'height',unknown:[]}}),/restrictions/i);
 assert.throws(()=>routePlanSnapshot({...plan,chosenAt:'yesterday'}),/chosenAt/i);
 const user={id:'d1',name:'D',assignedTruckIds:['t1']},db={trucks:[{id:'t1',plate:'B 1 X',odometer:1000}],trips:[]};
 const base={truckId:'t1',destination:'Bandung',startOdometer:1000,specs,specsConfirmed:true,externalRouteConfirmed:true,origin:{latitude:-6,longitude:106,accuracy:5,timestamp:Date.now()}};
 const planned=createTrip({...base,routePlan:plan},user,db,'trip1');
 assert.equal(planned.routing.status,'planned');assert.equal(planned.routing.provider,'ors');assert.equal(planned.routing.priority,'fastest');assert.deepEqual(planned.routing.plan,plan);assert.equal(planned.routing.externalRouteConfirmed,true);
 const unplanned=createTrip(base,user,db,'trip2');
 assert.equal(unplanned.routing.status,'not_connected');assert.equal(unplanned.routing.plan,undefined);
 assert.throws(()=>createTrip({...base,routePlan:plan,externalRouteConfirmed:false},user,db,'trip3'),/dispatcher/);
});

test('routes preview RBAC and validation, then trip started with chosen plan is persisted',async()=>{
 // Reuses the server module imported by the lifecycle test above; that test removed its temp dir, so recreate it.
 await mkdir(path.dirname(process.env.DATA_FILE),{recursive:true});
 process.env.AI_RATE_LIMIT_PER_MINUTE='100'; // this test previews more than 5 times; the limit itself is tested in ratelimit.test.js
 const {handleRequest}=await import('../server.js');
 let cookie='';
 const call=(url,method='GET',body)=>new Promise((resolve,reject)=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers={cookie};
  let status=200;const res={writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){try{resolve({status,data:JSON.parse(text)});}catch(e){reject(e);}}};
  handleRequest(req,res).catch(reject);
 });
 try{
  const origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};
  assert.equal((await call('/api/login','POST',{email:'workshop@demo.id',password:'demo1234'})).status,200);
  assert.equal((await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}]})).status,403);
  // The lifecycle test disabled the demo driver; use the second driver it created.
  assert.equal((await call('/api/login','POST',{email:'second@example.com',password:'AnotherDemo!2026'})).status,200);
  const preview=await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}]});
  assert.equal(preview.status,200);assert.equal(preview.data.routing.provider,'fixture');assert.ok(preview.data.routes.length>=2);
  assert.equal(preview.data.explanation.status,'not_configured');assert.deepEqual(preview.data.stops.map(s=>s.address),['Bandung']);
  const english=await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}],lang:'en'});
  assert.ok(english.data.routes.every(r=>r.warnings.some(w=>/^Sample route/.test(w))),'lang en reaches the route texts');
  const unknownLang=await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}],lang:'<script>'});
  assert.ok(unknownLang.data.routes.every(r=>r.warnings.some(w=>/^Rute contoh/.test(w))),'unsupported lang falls back to Indonesian');
  // The driver web app lives in public/driver; /driver redirects to its page in dev and production.
  const redirect=await new Promise((resolve,reject)=>{let status,headers={};handleRequest(Object.assign(Readable.from([]),{url:'/driver',method:'GET',headers:{}}),{writeHead(code,h){status=code;Object.assign(headers,h);},setHeader(){},end(){resolve({status,headers});}}).catch(reject);});
  assert.equal(redirect.status,302);assert.equal(redirect.headers.location,'/driver/index.html');
  assert.equal((await call('/api/routes/preview','POST',{origin:{...origin,timestamp:Date.now()-300000},specs,stops:[{address:'Bandung'}]})).status,400);
  assert.equal((await call('/api/routes/preview','POST',{origin,specs,stops:[]})).status,400);
  assert.equal((await call('/api/routes/preview','POST',{origin,specs,orderId:'missing'})).status,403);
  // Cost per route uses the driver's truck CPK; another driver's truck is refused.
  const own=(await call('/api/state')).data.trucks[0],otherTruck=(await call('/api/state')).data.trucks.length;
  const costed=(await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}],truckId:own.id})).data;
  assert.equal(typeof costed.routes[0].cost.maintenanceCost,'number','truck CPK reaches the route cost');assert.equal(costed.routes[0].cost.totalCost,null,'no order → fuel unknown → total unknown');
  assert.equal((await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}],truckId:'not-mine'})).status,403);
  assert.ok(otherTruck>=1);
  // Rough-road factor: admin-only setting, validated, delivered with route costs.
  assert.equal((await call('/api/settings','PUT',{roughRoadFactor:1.5})).status,403,'drivers cannot change settings');
  assert.equal((await call('/api/login','POST',{email:'admin@demo.id',password:'demo1234'})).status,200);
  assert.equal((await call('/api/settings','PUT',{roughRoadFactor:5})).status,400);
  assert.equal((await call('/api/settings','PUT',{roughRoadFactor:1.5})).status,200);
  assert.equal((await call('/api/state')).data.settings.roughRoadFactor,1.5);
  assert.equal((await call('/api/login','POST',{email:'second@example.com',password:'AnotherDemo!2026'})).status,200);
  assert.equal((await call('/api/routes/preview','POST',{origin,specs,stops:[{address:'Bandung'}],truckId:own.id})).data.routes[0].cost.roughRoadFactor,1.5);
  const state=(await call('/api/state')).data;
  assert.equal(state.integrations.routing.provider,'fixture');assert.equal(state.integrations.routing.status,'fixture_only');
  const active=state.trips.find(t=>t.status==='active');
  if(active)assert.equal((await call(`/api/trips/${active.id}/complete`,'POST',{endOdometer:active.startOdometer+10})).status,200);
  const truck=(await call('/api/state')).data.trucks[0],chosen=preview.data.routes[0];
  const routePlan={routeId:chosen.id,provider:preview.data.routing.provider,distanceKm:chosen.distanceKm,durationMin:chosen.durationMin,polyline:chosen.polyline,restrictions:chosen.restrictions,explanation:null,wasRecommended:chosen.recommended,chosenAt:new Date().toISOString()};
  const started=await call('/api/trips','POST',{truckId:truck.id,destination:'Bandung',startOdometer:truck.odometer,specs,specsConfirmed:true,externalRouteConfirmed:true,origin:{...origin,timestamp:Date.now()},routePlan});
  assert.equal(started.status,200,JSON.stringify(started.data));
  const trip=(await call(`/api/trips/${started.data.tripId}`)).data.trip;
  assert.equal(trip.routing.status,'planned');assert.equal(trip.routing.plan.routeId,chosen.id);assert.equal(trip.routing.plan.provider,'fixture');assert.equal(trip.routing.priority,'fastest');
  const saved=JSON.parse(await readFile(process.env.DATA_FILE,'utf8'));
  assert.equal(saved.trips.find(t=>t.id===started.data.tripId).routing.plan.distanceKm,chosen.distanceKm);
  assert.equal((await call(`/api/trips/${started.data.tripId}/complete`,'POST',{endOdometer:truck.odometer+Math.ceil(chosen.distanceKm)})).status,200);
 }finally{await rm(path.dirname(process.env.DATA_FILE),{recursive:true,force:true});}
});

test('odometer photo checks: read, consume once on start/complete, photo saved, evidence on the trip',async()=>{
 await mkdir(path.dirname(process.env.DATA_FILE),{recursive:true});
 const {handleRequest}=await import('../server.js');
 let cookie='';
 const call=(url,method='GET',body)=>new Promise((resolve,reject)=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=url;req.method=method;req.headers={cookie};
  let status=200;const res={writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){try{resolve({status,data:JSON.parse(text)});}catch(e){reject(e);}}};
  handleRequest(req,res).catch(reject);
 });
 try{
  const image={mimeType:'image/jpeg',data:Buffer.from([0xff,0xd8,0xff,0xe0,9,9]).toString('base64')};
  assert.equal((await call('/api/login','POST',{email:'manager@demo.id',password:'demo1234'})).status,200);
  assert.equal((await call('/api/odometer/read','POST',{stage:'start',typedKm:1,image})).status,403,'drivers only');
  assert.equal((await call('/api/login','POST',{email:'second@example.com',password:'AnotherDemo!2026'})).status,200);
  const truck=(await call('/api/state')).data.trucks[0],origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};
  assert.equal((await call('/api/odometer/read','POST',{stage:'start',typedKm:truck.odometer,image:{mimeType:'text/plain',data:'eA=='}})).status,400);
  // Observed on a phone: the second photo failed with "now is not defined" (expiry sweep runs only when checks are pending).
  const retake=await call('/api/odometer/read','POST',{stage:'start',typedKm:truck.odometer,image});
  assert.equal(retake.status,200,retake.data.error);
  const check=await call('/api/odometer/read','POST',{stage:'start',typedKm:truck.odometer,image});
  assert.equal(check.status,200,check.data.error);assert.equal(check.data.status,'unavailable','Gemini disabled in tests → not verified, not blocked');assert.match(check.data.checkId,/^[a-f0-9-]{36}$/);
  const base={truckId:truck.id,destination:'Bandung',specs,specsConfirmed:true,externalRouteConfirmed:true,origin};
  assert.equal((await call('/api/trips','POST',{...base,startOdometer:truck.odometer+5,odometerCheckId:check.data.checkId})).status,400,'typed value must equal the checked value');
  const started=await call('/api/trips','POST',{...base,startOdometer:truck.odometer,odometerCheckId:check.data.checkId});
  assert.equal(started.status,200,JSON.stringify(started.data));
  const trip=(await call(`/api/trips/${started.data.tripId}`)).data.trip;
  assert.equal(trip.odometerEvidence.start.status,'unavailable');assert.equal(trip.odometerEvidence.start.typedKm,truck.odometer);
  assert.equal(trip.odometerEvidence.start.photo,`${started.data.tripId}-start.jpg`);
  assert.deepEqual([...await readFile(path.join(path.dirname(process.env.DATA_FILE),'photos',trip.odometerEvidence.start.photo))],[0xff,0xd8,0xff,0xe0,9,9]);
  // A check is single use.
  const end=truck.odometer+12;
  const endCheck=await call('/api/odometer/read','POST',{stage:'end',tripId:started.data.tripId,typedKm:end,image});
  assert.equal((await call(`/api/trips/${started.data.tripId}/complete`,'POST',{endOdometer:end,odometerCheckId:check.data.checkId})).status,400,'start check cannot close the trip');
  assert.equal((await call(`/api/trips/${started.data.tripId}/complete`,'POST',{endOdometer:end,odometerCheckId:endCheck.data.checkId})).status,200);
  const done=(await call(`/api/trips/${started.data.tripId}`)).data.trip;
  assert.equal(done.odometerEvidence.end.status,'unavailable');assert.equal(done.odometerEvidence.end.photo,`${started.data.tripId}-end.jpg`);
  // Older clients without a photo still work and are marked not provided.
  const plain=await call('/api/trips','POST',{...base,startOdometer:end});
  assert.equal(plain.status,200);assert.equal((await call(`/api/trips/${plain.data.tripId}`)).data.trip.odometerEvidence.start.status,'not_provided');
  assert.equal((await call(`/api/trips/${plain.data.tripId}/complete`,'POST',{endOdometer:end+1})).status,200);
 }finally{await rm(path.dirname(process.env.DATA_FILE),{recursive:true,force:true});}
});
