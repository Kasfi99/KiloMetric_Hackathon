import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {seed,demoOrders} from '../lib/seed.js';
import {demoUsers} from '../lib/auth.js';
import {documentInput,extractOrders,googleOrderRoute,estimateCosts,newOrder,reviseOrder,orderFields,attachOrderToTrip} from '../lib/orders.js';

test('demo orders: assigned to the demo driver on their trucks, valid fields, ready to start',()=>{
 const db=seed();db.users=demoUsers(db.trucks);db.trips=[];
 const orders=demoOrders(db.users),driver=db.users.find(u=>u.role==='driver'),admin=db.users.find(u=>u.role==='admin');
 assert.equal(orders.length,8);assert.equal(new Set(orders.map(o=>o.reference)).size,8);
 for(const o of orders){
  assert.equal(o.status,'assigned');assert.equal(o.driverId,driver.id);assert.ok(driver.assignedTruckIds.includes(o.truckId));
  assert.ok(o.reviewedAt);assert.equal(o.reviewedBy,admin.id);assert.equal(o.source.kind,'demo_seed');assert.equal(o.estimate,null);
  assert.deepEqual(orderFields(o),Object.fromEntries(Object.keys(orderFields(o)).map(k=>[k,o[k]])),'fields survive the same validation as manual orders');
  assert.match(o.customer,/demo/i,'fictional customers are labelled demo');assert.ok(o.deliveryDate>=new Date().toISOString().slice(0,10));
 }
 assert.ok(orders.some(o=>o.stops.length>1),'one multi-stop order');
 // The driver can start a trip from a demo order with the order's truck and cargo.
 const order=orders[0],trip={id:'t',truckId:order.truckId,specs:{loadKg:order.cargoWeightKg}};
 const copy={...db,orders:structuredClone(orders)};attachOrderToTrip(copy,{orderId:order.id},driver,trip);
 assert.equal(copy.orders[0].status,'in_transit');assert.equal(trip.destination,order.stops.at(-1).address);
 assert.deepEqual(demoOrders([]),[],'no demo driver → no orders');
});

const fields={reference:'DO-101',customer:'PT Contoh',deliveryDate:'2026-10-15',pickupAddress:'Depot Jakarta, Indonesia',cargoWeightKg:4000,notes:'Handle carefully',stops:[{recipient:'A',address:'Warehouse Bekasi, Indonesia',contact:'',notes:''},{recipient:'B',address:'Warehouse Bandung, Indonesia',contact:'',notes:''}],items:[{description:'Boxes',quantity:20,unit:'box'}]};
const file={name:'delivery.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.7\nDelivery order fixture').toString('base64')};
const reply=value=>({ok:true,json:async()=>value});

test('delivery order OCR validates media, rejects malformed/unfinished output, and never trusts assignment fields',async()=>{
 const document=documentInput(file);assert.equal(document.size,Buffer.from(file.data,'base64').length);
 assert.throws(()=>documentInput({...file,mimeType:'image/png'}),/does not match/);
 assert.throws(()=>documentInput({...file,data:'!not-base64'}),/Invalid/);
 assert.throws(()=>documentInput({...file,data:'A'.repeat(12*1024*1024)}),/oversized/);
 let payload;
 const extracted=await extractOrders(document,{apiKey:'test',model:'test-model',fetcher:async(url,options)=>{payload=JSON.parse(options.body);return reply({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({orders:[{...fields,driverId:'forged',status:'assigned',distanceKm:10}],warnings:['Check recipient']})}]}}]});}});
 assert.equal(payload.contents[0].parts[1].inlineData.data,file.data);assert.equal(payload.generationConfig.responseMimeType,'application/json');
 assert.equal(extracted.orders[0].stops.length,2);assert.ok(!('driverId' in extracted.orders[0]));assert.ok(!('distanceKm' in extracted.orders[0]));
 await assert.rejects(()=>extractOrders(document,{apiKey:'test',model:'test',fetcher:async()=>reply({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})}),/did not finish/);
 await assert.rejects(()=>extractOrders(document,{apiKey:'test',model:'test',fetcher:async()=>reply({candidates:[{content:{parts:[{text:'not JSON'}]}}]})}),/invalid extraction/);
 await assert.rejects(()=>extractOrders(document,{apiKey:'test',model:'test',fetcher:async()=>reply({candidates:[{content:{parts:[{text:JSON.stringify({orders:[fields,{...fields,stops:[]}],warnings:[]})}]}}]})}),/1–10/);
});

test('Google distance uses pickup and all stops in order, includes tolls, and rejects partial addresses',async()=>{
 let request;
 const route=await googleOrderRoute(fields,{apiKey:'maps-test',fetcher:async(url,options)=>{assert.equal(url,'https://routes.googleapis.com/directions/v2:computeRoutes');request=JSON.parse(options.body);return reply({routes:[{distanceMeters:240000,duration:'14400s',travelAdvisory:{tollInfo:{estimatedPrice:[{currencyCode:'IDR',units:'125000',nanos:0}]}}}]});}});
 assert.equal(request.origin.address,fields.pickupAddress);assert.equal(request.destination.address,fields.stops[1].address);assert.deepEqual(request.intermediates,[{address:fields.stops[0].address}]);assert.equal(request.routeModifiers.avoidTolls,false);assert.equal(request.routingPreference,'TRAFFIC_AWARE');
 assert.equal(route.distanceKm,240);assert.equal(route.tollIdr,125000);assert.equal(route.truckRestrictionsVerified,false);assert.equal(route.returnToOriginIncluded,false);
 await assert.rejects(()=>googleOrderRoute(fields,{apiKey:'x',fetcher:async()=>reply({routes:[{distanceMeters:10}],geocodingResults:{origin:{partialMatch:true}}})}),/resolve an address precisely/);
 const noPrice=await googleOrderRoute(fields,{apiKey:'x',fetcher:async()=>reply({routes:[{distanceMeters:1000}]})});assert.equal(noPrice.tollIdr,null);
 await assert.rejects(()=>googleOrderRoute(fields,{apiKey:'x',fetcher:async()=>reply({routes:[]})}),/no positive/);
 await assert.rejects(()=>googleOrderRoute(fields,{}),/not configured/);
});

test('order trip costs separate maintenance CPK, fuel, tolls and unknown values',()=>{
 const db=seed(),truckId=db.trucks[0].id,order={...newOrder(fields,'order','admin'),truckId,costInputs:{fuelEfficiencyKmPerLiter:4,fuelPriceIdrPerLiter:10000,tollOverrideIdr:150000}},route={distanceKm:240,tollIdr:125000};
 const result=estimateCosts(order,route,db);
 assert.equal(result.fuelLiters,60);assert.equal(result.fuelCost,600000);assert.equal(result.tollCost,150000);assert.equal(result.tollSource,'admin_estimate');
 assert.equal(result.totalCost,result.maintenanceCost+750000);assert.equal(result.totalCpk,result.totalCost/240);
 assert.equal(estimateCosts({...order,costInputs:{...order.costInputs,fuelPriceIdrPerLiter:null}},route,db).totalCpk,null);
 assert.equal(estimateCosts({...order,truckId:null},route,db).maintenanceCpk,null);
 assert.equal(estimateCosts({...order,costInputs:{...order.costInputs,tollOverrideIdr:0}},route,db).tollCost,0);
});

test('review and assignment require valid date, version, active driver and assigned truck',()=>{
 const order=newOrder(fields,'order','admin');const driver={id:'d',role:'driver',active:true,assignedTruckIds:['t']},db={users:[driver],trucks:[{id:'t'}]};
 const input={...fields,version:1,reviewed:true,driverId:'d',truckId:'t',costInputs:{}};
 assert.throws(()=>reviseOrder(order,{...input,reviewed:false},db,{id:'a'}),/Review and confirm/);
 assert.throws(()=>reviseOrder(order,{...input,version:0},db,{id:'a'}),/changed/);
 assert.throws(()=>reviseOrder(order,{...input,truckId:'unassigned'},db,{id:'a'}),/active driver/);
 assert.throws(()=>reviseOrder(order,{...input,deliveryDate:'2026-02-30'},db,{id:'a'}),/valid delivery date/);
 assert.equal(reviseOrder(order,input,db,{id:'a'}).status,'assigned');
});

test('admin OCR to multi-stop dispatch: RBAC, duplicate protection, automatic Maps estimates, trip completion and persistence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'kilometric-orders-'));
 Object.assign(process.env,{DATA_FILE:path.join(dir,'fleet.json'),GEMINI_API_KEY:'fake-ocr-key',MAPS_API_KEY:'fake-maps-key',DISABLE_GEMINI:'0',DISABLE_ORS:'1',DEMO_ORDERS:'0',FLEETWISE_NO_LISTEN:'1'});
 const originalFetch=globalThis.fetch;let ocrMode='valid',mapsMode='valid',ocrCalls=0;
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.includes('routes.googleapis.com')){if(mapsMode==='fail')return {ok:false,status:403};return reply({routes:[{distanceMeters:240000,duration:'14400s',travelAdvisory:{tollInfo:{estimatedPrice:[{currencyCode:'IDR',units:'125000'}]}}}]});}
  if(body.generationConfig.responseMimeType==='application/json'){ocrCalls++;return reply({candidates:[{finishReason:'STOP',content:{parts:[{text:ocrMode==='valid'?JSON.stringify({orders:[fields,{...fields,reference:'DO-102'}],warnings:['Verify all addresses']}):'{broken'}]}}]});}
  return reply({candidates:[{content:{parts:[{text:'Maintenance analysis'}]}}]});
 };
 try{
  const {handleRequest}=await import('../server.js');
  function client(){let cookie='';return (url,method='GET',body)=>new Promise((resolve,reject)=>{const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{cookie}});let status=200;handleRequest(req,{writeHead(code){status=code;},setHeader(name,value){if(name==='set-cookie')cookie=value.split(';')[0];},end(text){resolve({status,data:JSON.parse(text)});}}).catch(reject);});}
  const admin=client(),driver=client(),manager=client(),workshop=client();
  for(const [call,role] of [[admin,'admin'],[driver,'driver'],[manager,'manager'],[workshop,'workshop']])assert.equal((await call('/api/login','POST',{email:`${role}@demo.id`,password:'demo1234'})).status,200);
  for(const call of [driver,manager,workshop])assert.equal((await call('/api/orders/extract','POST',file)).status,403);
  assert.equal(ocrCalls,0);
  ocrMode='invalid';assert.equal((await admin('/api/orders/extract','POST',file)).status,502);assert.equal((await admin('/api/state')).data.orders.length,0);
  ocrMode='valid';const extracted=await admin('/api/orders/extract','POST',file);assert.equal(extracted.status,200);assert.equal(extracted.data.orders.length,2);
  assert.equal((await admin('/api/orders/extract','POST',file)).status,400);
  assert.equal((await manager('/api/state')).data.orders.length,0);assert.equal((await workshop('/api/state')).data.orders.length,0);assert.equal((await driver('/api/state')).data.orders.length,0);
  const initial=(await admin('/api/state')).data,own=(await driver('/api/state')).data,order=extracted.data.orders[0];
  assert.equal(order.status,'draft');assert.equal(order.estimate,null);
  const input={...order,reviewed:true,driverId:own.currentUser.id,truckId:own.trucks[0].id,costInputs:{fuelEfficiencyKmPerLiter:4,fuelPriceIdrPerLiter:10000,tollOverrideIdr:150000}};
  assert.equal((await admin(`/api/orders/${order.id}/estimate`,'POST',{version:1})).status,400);
  assert.equal((await admin(`/api/orders/${order.id}`,'PUT',{...input,truckId:initial.trucks[2].id})).status,400);
  const saved=await admin(`/api/orders/${order.id}`,'PUT',input);assert.equal(saved.status,200);assert.equal(saved.data.order.status,'assigned');
  assert.equal((await admin(`/api/orders/${order.id}`,'PUT',input)).status,400,'stale edit rejected');
  delete process.env.MAPS_API_KEY;assert.equal((await admin(`/api/orders/${order.id}/estimate`,'POST',{version:2})).status,503);process.env.MAPS_API_KEY='fake-maps-key';
  mapsMode='fail';assert.equal((await admin(`/api/orders/${order.id}/estimate`,'POST',{version:2})).status,502);assert.equal((await admin('/api/state')).data.orders[0].status,'assigned');mapsMode='valid';
  const estimated=await admin(`/api/orders/${order.id}/estimate`,'POST',{version:2});assert.equal(estimated.status,200);assert.equal(estimated.data.order.estimate.distanceKm,240);assert.equal(estimated.data.order.estimate.fuelCost,600000);
  const visible=(await driver('/api/state')).data.orders;assert.equal(visible.length,1);assert.ok(!('source' in visible[0]));assert.ok(!('source' in (await driver('/api/orders')).data.orders[0]));
  assert.equal((await driver(`/api/orders/${order.id}`,'PUT',input)).status,403);
  const tripInput={orderId:order.id,truckId:own.trucks[0].id,destination:'Forged destination',startOdometer:own.trucks[0].odometer,origin:{latitude:-6.2,longitude:106.8,accuracy:10,timestamp:Date.now()},specs:{heightM:3.5,widthM:2.4,lengthM:9,axles:2,tareKg:8000,maxGrossKg:20000,loadKg:4000,hazmat:'none'},specsConfirmed:true,externalRouteConfirmed:true};
  assert.equal((await driver('/api/trips','POST',{...tripInput,orderId:extracted.data.orders[1].id})).status,400);
  assert.equal((await driver('/api/trips','POST',{...tripInput,specs:{...tripInput.specs,loadKg:3000}})).status,400);
  const started=await driver('/api/trips','POST',tripInput);assert.equal(started.status,200);const trip=(await driver(`/api/trips/${started.data.tripId}`)).data.trip;
  assert.equal(trip.destination,fields.stops[1].address);assert.equal(trip.deliveryStops.length,2);assert.equal((await admin('/api/state')).data.orders[0].status,'in_transit');
  assert.equal((await admin(`/api/orders/${order.id}`,'PUT',{...input,version:4})).status,400);
  assert.equal((await driver(`/api/trips/${trip.id}/complete`,'POST',{endOdometer:trip.startOdometer+240})).status,200);
  const final=(await admin('/api/state')).data;assert.equal(final.orders[0].status,'completed');assert.equal(final.analytics.totalSpend,initial.analytics.totalSpend,'estimates never become actual maintenance charges');
  const persisted=JSON.parse(await readFile(process.env.DATA_FILE,'utf8'));assert.equal(persisted.orders[0].tripId,trip.id);assert.equal(persisted.orders[0].estimate.totalCost,estimated.data.order.estimate.totalCost);assert.ok(!JSON.stringify(persisted).includes(file.data),'raw document is not retained');assert.ok(!JSON.stringify(final).includes('fake-ocr-key'));
  await new Promise(resolve=>setTimeout(resolve,1700));
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});
