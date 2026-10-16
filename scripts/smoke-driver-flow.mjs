// End-to-end driver flow against a running server, using the same calls as public/driver/app.js.
// Run: node scripts/smoke-driver-flow.mjs [baseUrl]   (default http://localhost:3000; use a fresh demo DB)
// Exercises: session → login → state → route preview (lang en) → start trip with plan → GPS batch → trip detail → complete.
const base=process.argv[2]||'http://localhost:3000';
let cookie='';
async function call(path,{method='GET',body}={}){
 const res=await fetch(base+path,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),origin:base},body:body!==undefined?JSON.stringify(body):undefined,redirect:'manual'});
 const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const data=await res.json().catch(()=>({}));return {status:res.status,data,headers:res.headers};
}
const check=(ok,label,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${label}${detail?`  — ${detail}`:''}`);if(!ok)process.exitCode=1;return ok};
const page=await fetch(base+'/driver',{redirect:'manual'});
check(page.status===302&&page.headers.get('location')==='/driver/index.html','/driver redirects to the app page');
for(const f of ['index.html','app.js','style.css','driver.css']){const r=await fetch(`${base}/driver/${f}`);check(r.ok,`serves /driver/${f}`,`HTTP ${r.status}`)}
check((await call('/api/session')).data.user===null,'session starts signed out');
const login=await call('/api/login',{method:'POST',body:{email:'driver@demo.id',password:'demo1234'}});
check(login.status===200&&login.data.user.role==='driver','driver login (cookie)',login.data.error);
const state=(await call('/api/state')).data;
check(state.orders?.length>=1,'driver sees demo orders',state.orders?.map(o=>`${o.reference} ${o.status}`).join(', '));
const order=state.orders.find(o=>o.status==='assigned');
if(!check(order,'an assigned order is available','reseed the demo database to rerun'))process.exit(1);
const truck=state.trucks.find(t=>t.id===order.truckId);
const origin={latitude:-6.2297,longitude:106.8295,accuracy:12,timestamp:Date.now()};
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:order.cargoWeightKg,hazmat:'none'};
const t0=Date.now(),preview=await call('/api/routes/preview',{method:'POST',body:{orderId:order.id,origin,specs,lang:'en'}});
check(preview.status===200,'route preview',`HTTP ${preview.status} in ${Date.now()-t0} ms ${preview.data.error||''}`);
const p=preview.data;
check(p.routes?.length>=1,`${p.routes?.length} route(s) from ${p.routing?.provider}`,p.routes?.map(r=>`${r.distanceKm} km/${r.durationMin} min${r.recommended?' ★':''}`).join(' | '));
check(p.stops?.every(s=>s.geocodePrecision==='exact')||p.routing?.provider==='fixture','demo stops resolve exactly',p.stops?.map(s=>`${s.geocodeLabel} [${s.geocodePrecision}]`).join(' | '));
check(p.routes?.every(r=>r.warnings.every(w=>!/hanya|tidak|Rute contoh/.test(w))),'warnings in English',[...new Set(p.routes?.flatMap(r=>r.warnings))].join(' / ')||'none');
console.log(`      AI: ${p.explanation?.status} — ${p.explanation?.summary}`);
const r=p.routes.find(x=>x.recommended)||p.routes[0],x=p.explanation;
const routePlan={routeId:r.id,provider:p.routing.provider,distanceKm:r.distanceKm,durationMin:Math.max(1,r.durationMin),polyline:r.polyline.length>2000?r.polyline.filter((_,i)=>i%Math.ceil(r.polyline.length/2000)===0).concat([r.polyline.at(-1)]):r.polyline,restrictions:r.restrictions,explanation:x?.status==='ok'?{recommendedRouteId:x.recommendedRouteId,headline:(x.perRoute.find(q=>q.routeId===r.id)?.headline||x.summary).slice(0,200)}:null,wasRecommended:r.recommended===true,chosenAt:new Date().toISOString()};
const start=await call('/api/trips',{method:'POST',body:{truckId:truck.id,orderId:order.id,destination:order.stops.at(-1).address,startOdometer:truck.odometer,specs,specsConfirmed:true,externalRouteConfirmed:true,origin:{...origin,timestamp:Date.now()},routePlan}});
check(start.status===200,'start trip with route plan',start.data.error);
const tripId=start.data.tripId;
// After the trip origin: ~40 m every 2 s ≈ 70 km/h, under the 160 km/h plausibility limit and within the 15 s clock allowance.
const t1=Date.now(),points=[1,2,3].map(i=>({latitude:origin.latitude+i*0.00025,longitude:origin.longitude+i*0.00025,accuracy:10,timestamp:t1+i*2000}));
const loc=await call(`/api/trips/${tripId}/locations`,{method:'POST',body:{points}});
check(loc.status===200&&loc.data.accepted===3,'GPS batch accepted',JSON.stringify(loc.data));
const trip=(await call(`/api/trips/${tripId}`)).data.trip;
check(trip.routing.status==='planned'&&trip.routing.plan.routeId===r.id&&trip.points.length===4,'trip stores plan and points',`plan ${trip.routing.plan.distanceKm} km, ${trip.points.length} points, GPS ${trip.gpsDistanceKm.toFixed(2)} km`);
check((await call('/api/state')).data.orders.find(o=>o.id===order.id).status==='in_transit','order is in transit');
const done=await call(`/api/trips/${tripId}/complete`,{method:'POST',body:{endOdometer:truck.odometer+Math.ceil(r.distanceKm)}});
check(done.status===200,'complete trip',done.data.error);
const after=(await call('/api/state')).data,closed=after.trips.find(t=>t.id===tripId);
check(closed.status==='completed'&&after.orders.find(o=>o.id===order.id).status==='completed','trip and order completed',`odometer ${closed.odometerDistanceKm} km, estimated maintenance ${closed.estimatedMaintenanceCost===null?'unknown':'Rp'+Math.round(closed.estimatedMaintenanceCost)}`);
check((await call('/api/logout',{method:'POST',body:{}})).status===200&&(await call('/api/state')).status===401,'logout ends the session');
