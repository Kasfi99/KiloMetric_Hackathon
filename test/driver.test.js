import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {truckSpecifications,locationPoint,addLocations,haversine} from '../lib/trips.js';
import {hashPassword,verifyPassword} from '../lib/auth.js';

const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:8000,hazmat:'none'};
test('password hashes, truck load validation, and GPS quality checks',()=>{
 const hash=hashPassword('test-password');assert.notEqual(hash,'test-password');assert.ok(verifyPassword('test-password',hash));assert.ok(!verifyPassword('wrong',hash));
 assert.equal(truckSpecifications(specs).grossKg,16000);
 assert.throws(()=>truckSpecifications({...specs,loadKg:13000}),/exceed/);
 assert.throws(()=>truckSpecifications({...specs,heightM:''}),/height/);
 assert.throws(()=>truckSpecifications({...specs,axles:2.5}),/whole/);
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
 process.env.DATA_FILE=path.join(dir,'fleet.json');process.env.DISABLE_GEMINI='1';process.env.FLEETWISE_NO_LISTEN='1';
 try{
  const {handleRequest}=await import('../server.js');
  function client(){let cookie='';return (url,method='GET',body)=>new Promise((resolve,reject)=>{
   const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{cookie}});let status=200,headers={};
   handleRequest(req,{writeHead(code,values){status=code;Object.assign(headers,values);},setHeader(name,value){headers[name]=value;if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text),headers});}}).catch(reject);
  });}
  const driver=client(),admin=client(),manager=client(),workshop=client(),other=client();
  assert.equal((await driver('/api/state')).status,401);
  assert.equal((await driver('/api/trips','POST',{})).status,401);
  assert.equal((await driver('/api/login','POST',{email:'driver@fleetwise.local',password:'wrong'})).status,401);
  const login=async(call,role)=>call('/api/login','POST',{email:`${role}@fleetwise.local`,password:'FleetwiseDemo!2026'});
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
  const route=await driver('/api/routes/preview','POST',input);assert.equal(route.status,503);assert.deepEqual(route.data.routes,[]);
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
  const driverUser=users.find(u=>u.role==='driver'&&u.email==='driver@fleetwise.local');
  assert.equal((await admin(`/api/users/${driverUser.id}`,'PUT',{...driverUser,active:false})).status,200);
  assert.equal((await driver('/api/state')).status,401,'disabled users lose their existing session');
  const persisted=JSON.parse(await readFile(process.env.DATA_FILE,'utf8'));assert.equal(persisted.trips.find(t=>t.id===tripId).status,'completed');assert.ok(persisted.users.every(u=>u.passwordHash));
  await manager('/api/logout','POST',{});assert.equal((await manager('/api/state')).status,401);
 }finally{await rm(dir,{recursive:true,force:true});}
});
