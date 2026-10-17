import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureRoutes,RESTRICTION_KEYS,geocodeStops,orsRoutes,legRoutes,previewRoutes,routeStops,routeCosts} from '../lib/routing.js';
import {explainRoutes} from '../lib/route-explainer.js';

const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:8000,hazmat:'none',grossKg:16000};
const origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};

test('fixture routes: deterministic demo candidates labelled as fixture',()=>{
 const stops=[{address:'Gudang A',latitude:-6.1754,longitude:106.8272},{address:'Toko B',latitude:-6.9147,longitude:107.6098}];
 const result=fixtureRoutes({origin,stops,specs});
 assert.equal(result.provider,'fixture');
 assert.ok(result.routes.length>=2&&result.routes.length<=3);
 assert.deepEqual(result.routes.map(r=>r.rank),result.routes.map((_,i)=>i+1));
 assert.ok(result.routes[0].durationMin<=result.routes[1].durationMin,'rank 1 is fastest');
 for(const r of result.routes){
  assert.match(r.id,/^fixture-/);assert.ok(r.distanceKm>0&&r.durationMin>0);
  assert.deepEqual(r.polyline[0],[origin.latitude,origin.longitude]);assert.deepEqual(r.polyline.at(-1),[stops[1].latitude,stops[1].longitude]);
  assert.equal(r.tollIdr,null);assert.deepEqual(r.restrictions.checked,[]);assert.deepEqual(r.restrictions.unknown,RESTRICTION_KEYS);
  assert.ok(r.warnings.some(w=>/contoh|fixture/i.test(w)));
 }
 // Stops without coordinates fall back to fixture coordinates instead of failing.
 const blind=fixtureRoutes({origin,stops:[{address:'Alamat tak dikenal',latitude:null,longitude:null}],specs});
 assert.ok(blind.routes.length>=2);assert.equal(blind.routes[0].polyline.at(-1).length,2);
});

const reply=(data,ok=true,status=ok?200:500)=>({ok,status,json:async()=>data});

test('geocodeStops: ORS Pelias request shape, confidence, and null on miss',async()=>{
 const urls=[];
 // Responses keyed by query text: geocodeStops runs requests concurrently, so arrival order is not guaranteed.
 const answers={'Kawasan Industri Pulogadung, Jakarta Timur':{geometry:{coordinates:[106.9,-6.19]},properties:{confidence:1,label:'PT. JIEP Kawasan Industri Pulogadung, East Jakarta, JK, Indonesia',layer:'venue',match_type:'exact'}},'Jl. Asia Afrika 8, Bandung':{geometry:{coordinates:[107.626976,-6.925927]},properties:{confidence:0.6,label:'Bandung, JR, Indonesia',layer:'locality',match_type:'fallback'}}};
 const fetcher=async url=>{const u=new URL(url);urls.push(u);const f=answers[u.searchParams.get('text')];return reply({features:f?[f]:[]});};
 const stops=await geocodeStops(['Kawasan Industri Pulogadung, Jakarta Timur','Jl. Asia Afrika 8, Bandung','Alamat tidak ada'],origin,{apiKey:'ors-test',fetcher});
 assert.equal(urls[0].pathname,'/geocode/search');assert.equal(urls[0].searchParams.get('boundary.country'),'ID');assert.equal(urls[0].searchParams.get('size'),'1');
 assert.equal(urls[0].searchParams.get('focus.point.lat'),String(origin.latitude));assert.equal(urls[0].searchParams.get('api_key'),'ors-test');
 assert.deepEqual(stops[0],{address:'Kawasan Industri Pulogadung, Jakarta Timur',latitude:-6.19,longitude:106.9,geocodeConfidence:1,geocodeLabel:'PT. JIEP Kawasan Industri Pulogadung, East Jakarta, JK, Indonesia',geocodePrecision:'exact',geocodeLayer:'venue'});
 // Observed live: a street address falling back to the city centroid still scores 0.6 — must be flagged approximate.
 assert.equal(stops[1].geocodePrecision,'approximate');assert.equal(stops[1].geocodeLayer,'locality');assert.equal(stops[1].geocodeConfidence,0.6);
 assert.deepEqual(stops[2],{address:'Alamat tidak ada',latitude:null,longitude:null,geocodeConfidence:null,geocodeLabel:null,geocodePrecision:null,geocodeLayer:null});
 await assert.rejects(()=>geocodeStops(['x'],origin,{apiKey:'k',fetcher:async()=>reply({},false,403)}),/HTTP 403/);
 await assert.rejects(()=>geocodeStops(['x'],origin,{apiKey:'',fetcher}),/not configured/);
});

const geojson=(...summaries)=>({type:'FeatureCollection',features:summaries.map(([distance,duration,ascent,descent])=>({type:'Feature',properties:{summary:{distance,duration},ascent,descent},geometry:{type:'LineString',coordinates:[[106.8295,-6.2297,12],[107.0,-6.5,80],[107.6098,-6.9147,700]]}}))});

test('orsRoutes: truck restrictions in request, geojson mapped to ranked candidates',async()=>{
 let request;
 const fetcher=async(url,options)=>{assert.equal(url,'https://api.openrouteservice.org/v2/directions/driving-hgv/geojson');assert.equal(options.headers.Authorization,'ors-test');request=JSON.parse(options.body);return reply(geojson([42000,2520,273,272],[46700,3240,316,315]));};
 const cikarang=[{address:'Cikarang',latitude:-6.2617,longitude:107.1528}];   // ~36 km straight-line: alternatives allowed
 const result=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'ors-test',fetcher});
 assert.deepEqual(request.coordinates,[[106.8295,-6.2297],[107.1528,-6.2617]]);
 assert.deepEqual(request.options.profile_params.restrictions,{height:3.5,width:2.4,length:9,weight:16},'per-axle load is not declared, so it is not sent');
 assert.equal(request.options.vehicle_type,'hgv');assert.equal(request.alternative_routes.target_count,3);assert.equal(request.elevation,true);
 assert.equal(result.provider,'ors');assert.equal(result.status,'ok');assert.equal(result.routes.length,2);
 assert.equal(result.routes[0].id,'ors-1');assert.equal(result.routes[0].rank,1);assert.equal(result.routes[0].distanceKm,42);assert.equal(result.routes[0].durationMin,42);
 assert.equal(result.routes[1].rank,2);assert.equal(result.routes[1].durationMin,54);
 assert.deepEqual(result.routes[0].polyline,[[-6.2297,106.8295],[-6.5,107],[-6.9147,107.6098]]);
 assert.equal(result.routes[0].ascendM,273);assert.equal(result.routes[0].descendM,272);assert.equal(result.routes[0].tollIdr,null);
 assert.deepEqual(result.routes[0].restrictions.checked,['height','width','length','weight']);
 assert.deepEqual(result.routes[0].restrictions.unknown,['axleload','hazmat','bridge_limits','truck_bans','time_restrictions']);
 assert.deepEqual(result.routes[0].warnings,[]);
 // Long trip (>70 km straight-line): ORS public alternatives cap is 100 km, so request one route and say why.
 const bandung=[{address:'Bandung',latitude:-6.9147,longitude:107.6098}];
 const long=await orsRoutes({origin,stops:bandung,specs},{apiKey:'k',fetcher:async(u,o)=>{request=JSON.parse(o.body);return reply(geojson([168200,8640,2495,1818]));}});
 assert.equal(request.alternative_routes,undefined);assert.equal(long.routes.length,1);assert.ok(long.routes[0].warnings.some(w=>/100 km/.test(w)));
 // Observed live: ORS error 2004 (alternatives over limit) → retry once without alternatives.
 const calls=[];
 const retried=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async(u,o)=>{const b=JSON.parse(o.body);calls.push(Boolean(b.alternative_routes));return b.alternative_routes?reply({error:{code:2004,message:'limit'}},false,400):reply(geojson([42000,2520,273,272]));}});
 assert.deepEqual(calls,[true,false]);assert.equal(retried.routes.length,1);assert.ok(retried.routes[0].warnings.some(w=>/alternatif/i.test(w)));
 // Observed live: alternatives request can hang → timeout → retry without alternatives.
 const timedOut=[];
 await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async(u,o)=>{const b=JSON.parse(o.body);timedOut.push(Boolean(b.alternative_routes));if(b.alternative_routes){const e=new Error('timeout');e.name='TimeoutError';throw e;}return reply(geojson([42000,2520,273,272]));}});
 assert.deepEqual(timedOut,[true,false]);
 // Other 400s are real errors, not retried.
 await assert.rejects(()=>orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async()=>reply({error:{code:2010,message:'point not found'}},false,404)}),/HTTP 404/);
 // Multi-stop: no alternative_routes in request, warning added, hazmat flag forwarded.
 const multi=await orsRoutes({origin,stops:[{address:'A',latitude:-6.3,longitude:106.9},...bandung],specs:{...specs,hazmat:'flammable'}},{apiKey:'k',fetcher:async(u,o)=>{request=JSON.parse(o.body);return reply(geojson([160000,9600,600,400]));}});
 assert.equal(request.alternative_routes,undefined);assert.equal(request.options.profile_params.restrictions.hazmat,true);
 assert.ok(multi.routes[0].warnings.some(w=>/multi-stop/i.test(w)));assert.ok(multi.routes[0].restrictions.checked.includes('hazmat'));
 // Observed live: ORS returned two identical alternatives (32.4 km / 37 min twice) — near-duplicates are collapsed.
 const dupes=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async()=>reply(geojson([32900,2160,50,40],[32400,2220,60,50],[32450,2230,61,49]))});
 assert.deepEqual(dupes.routes.map(r=>[r.id,r.distanceKm,r.durationMin]),[['ors-1',32.9,36],['ors-2',32.4,37]]);
 // Observed live: a point snapped to water produced 3108 km for a ~40 km trip — implausible routes are dropped.
 const mixed=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async()=>reply(geojson([42000,2520,273,272],[3108000,979020,12757,12755]))});
 assert.equal(mixed.routes.length,1);assert.equal(mixed.routes[0].distanceKm,42);
 await assert.rejects(()=>orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',fetcher:async()=>reply(geojson([3108000,979020,12757,12755]))}),/implausible/);
 await assert.rejects(()=>orsRoutes({origin,stops:bandung,specs},{apiKey:'k',fetcher:async()=>reply({features:[]})}),/no route/i);
 await assert.rejects(()=>orsRoutes({origin,stops:[{address:'x',latitude:null,longitude:null}],specs},{apiKey:'k',fetcher}),/coordinates/i);
});

test('roadCondition: ORS extras summarised per route (km paved / rough / unknown / steep / ferry) and summed across legs',async()=>{
 const extras={surface:{summary:[{value:3,distance:30000},{value:2,distance:2000},{value:0,distance:1000}]},steepness:{summary:[{value:0,distance:31000},{value:4,distance:1500},{value:-3,distance:500}]},waytype:{summary:[{value:1,distance:33000}]}};
 let request;
 const fc=(extrasFor)=>({type:'FeatureCollection',features:[{properties:{summary:{distance:33000,duration:2400},ascent:10,descent:10,extras:extrasFor},geometry:{type:'LineString',coordinates:[[106.8295,-6.2297],[107.1528,-6.2617]]}}]});
 const cikarang=[{address:'Cikarang',latitude:-6.2617,longitude:107.1528}];
 const r=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',alternatives:false,fetcher:async(u,o)=>{request=JSON.parse(o.body);return reply(fc(extras));}});
 assert.deepEqual(request.extra_info,['surface','waytype','steepness']);
 assert.deepEqual(r.routes[0].roadCondition,{pavedKm:30,roughKm:2,unknownKm:1,steepKm:2,ferryKm:0});
 // No extras from the provider: everything is unknown, nothing is guessed.
 const bare=await orsRoutes({origin,stops:cikarang,specs},{apiKey:'k',alternatives:false,fetcher:async()=>reply(fc(undefined))});
 assert.deepEqual(bare.routes[0].roadCondition,{pavedKm:0,roughKm:0,unknownKm:33,steepKm:0,ferryKm:0});
 // Stitched legs add up.
 const pickup={address:'P',latitude:-6.19,longitude:106.9},dest={address:'D',latitude:-6.104,longitude:106.884};
 const legs=await legRoutes({origin,stops:[pickup,dest],specs},{apiKey:'k',fetcher:async(u,o)=>{const b=JSON.parse(o.body);return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:10000,duration:900},ascent:1,descent:1,extras:{surface:{summary:[{value:b.coordinates[0][0]===origin.longitude?3:4,distance:10000}]}}},geometry:{type:'LineString',coordinates:[b.coordinates[0],b.coordinates.at(-1)]}}]});}});
 assert.deepEqual(legs.routes[0].roadCondition,{pavedKm:20,roughKm:0,unknownKm:0,steepKm:0,ferryKm:0});
 assert.equal(fixtureRoutes({origin,stops:cikarang,specs}).routes[0].roadCondition,null,'sample routes have no road data');
});

test('routeCosts: maintenance (CPK × km, rough km × admin factor) + fuel → trip CPK; recommend cheapest, else fastest',()=>{
 const routes=[{id:'a',distanceKm:40,durationMin:40,roadCondition:{pavedKm:36,roughKm:4,unknownKm:0,steepKm:0,ferryKm:0}},{id:'b',distanceKm:50,durationMin:35,roadCondition:{pavedKm:50,roughKm:0,unknownKm:0,steepKm:0,ferryKm:0}}];
 const fuel={efficiencyKmPerLiter:4,priceIdrPerLiter:6800};
 const withFactor=routeCosts(routes,{cpk:400,fuel,roughRoadFactor:1.5});
 assert.deepEqual(withFactor.routes[0].cost,{maintenanceCost:16800,fuelCost:68000,tollCost:null,tollIncluded:false,totalCost:84800,tripCpk:2120,roughRoadFactor:1.5,factorApplied:true});
 assert.deepEqual(withFactor.routes[1].cost,{maintenanceCost:20000,fuelCost:85000,tollCost:null,tollIncluded:false,totalCost:105000,tripCpk:2100,roughRoadFactor:1.5,factorApplied:false});
 assert.deepEqual([withFactor.recommendedId,withFactor.basis],['a','cost'],'cheaper total wins even though b is faster');
 const noFactor=routeCosts(routes,{cpk:400,fuel,roughRoadFactor:null});
 assert.equal(noFactor.routes[0].cost.maintenanceCost,16000);assert.equal(noFactor.routes[0].cost.factorApplied,false);
 const noFuel=routeCosts(routes,{cpk:400,fuel:null,roughRoadFactor:null});
 assert.equal(noFuel.routes[0].cost.fuelCost,null);assert.equal(noFuel.routes[0].cost.totalCost,null);assert.equal(noFuel.routes[0].cost.tripCpk,null);
 assert.equal(noFuel.routes[0].cost.maintenanceCost,16000,'known parts are still shown');
 assert.deepEqual([noFuel.recommendedId,noFuel.basis],['b','time'],'unknown cost → fastest');
 const noCpk=routeCosts(routes,{cpk:null,fuel,roughRoadFactor:1.5});
 assert.equal(noCpk.routes[0].cost.maintenanceCost,null);assert.equal(noCpk.basis,'time');
 const unknownRoad=routeCosts([{...routes[0],roadCondition:null}],{cpk:400,fuel,roughRoadFactor:1.5});
 assert.equal(unknownRoad.routes[0].cost.factorApplied,false,'no road data → no adjustment');
 // Observed in the emulator: a single multi-stop route was badged "lowest cost" with nothing to compare against.
 assert.deepEqual([unknownRoad.recommendedId,unknownRoad.basis],['a','only'],'one route → no comparison claim');
});

test('previewRoutes: server recommends by cost; Gemini only explains that pick',async()=>{
 const stops=[{address:'Cikarang'}],geo=reply({features:[{geometry:{coordinates:[107.1528,-6.2617]},properties:{confidence:1,label:'Cikarang',layer:'venue',match_type:'exact'}}]});
 // ors-1 faster (36 min) but longer; ors-2 slower but cheaper.
 const routesFc=reply(geojson([46000,2160,50,40],[40000,2400,60,50]));
 let explainBody;
 const fetcher=(gemini)=>async(url,options)=>String(url).includes('/geocode/')?geo:String(url).includes('/v2/directions/')?routesFc:(explainBody=JSON.parse(options.body),geminiReply(gemini));
 const explanation={recommendedRouteId:'ors-2',summary:'Route 2 costs less.',perRoute:[{routeId:'ors-1',headline:'Faster',pros:['3 min faster'],cons:['Costs more']},{routeId:'ors-2',headline:'Cheapest',pros:['Lowest cost'],cons:['Slower']}],caveats:['Toll unknown.']};
 const options={orsKey:'k',gemini:{apiKey:'g',model:'m-cost'},cpk:400,fuel:{efficiencyKmPerLiter:4,priceIdrPerLiter:6800},roughRoadFactor:null};
 const res=await previewRoutes({origin,specs,stops,lang:'en'},{...options,fetcher:fetcher(explanation)});
 assert.deepEqual(res.body.recommendation,{routeId:'ors-2',basis:'cost'});
 // ors-1: 400×46 + 46/4×6800 = 18,400 + 78,200; ors-2: 400×40 + 40/4×6800 = 16,000 + 68,000.
 assert.deepEqual(res.body.routes.map(r=>[r.id,r.recommended,r.cost.totalCost]),[['ors-1',false,96600],['ors-2',true,84000]]);
 const sent=JSON.parse(explainBody.contents[0].parts[0].text);
 assert.equal(sent.recommendedRouteId,'ors-2');assert.equal(sent.routes[1].cost.totalCost,84000);assert.ok(sent.routes[0].roadCondition);
 assert.match(explainBody.systemInstruction.parts[0].text,/already recommends/);
 assert.equal(res.body.explanation.status,'ok');
 // Gemini pushing a different route: explanation rejected, server recommendation unchanged.
 const rogue=await previewRoutes({origin,specs,stops,lang:'en'},{...options,gemini:{apiKey:'g',model:'m-rogue'},fetcher:fetcher({...explanation,recommendedRouteId:'ors-1'})});
 assert.equal(rogue.body.explanation.status,'unavailable');assert.equal(rogue.body.routes.find(r=>r.recommended).id,'ors-2');
 // Without cost inputs: fastest, basis time.
 const fast=await previewRoutes({origin,specs,stops,lang:'en'},{orsKey:'k',gemini:null,fetcher:fetcher(explanation)});
 assert.deepEqual(fast.body.recommendation,{routeId:'ors-1',basis:'time'});assert.equal(fast.body.routes[0].cost.totalCost,null);
});

test('legRoutes: approach leg to the first stop + main leg alternatives, stitched into full candidates',async()=>{
 // Order trips always have GPS origin → pickup → destination; one multi-stop ORS call would give no alternatives.
 const pickup={address:'Pulogadung',latitude:-6.19,longitude:106.9},dest={address:'JICT',latitude:-6.104,longitude:106.884};
 const lineFrom=(a,b)=>({type:'LineString',coordinates:[[a.longitude,a.latitude,10],[b.longitude,b.latitude,20]]});
 const requests=[];
 const fetcher=async(url,options)=>{const b=JSON.parse(options.body);requests.push(b);
  const [from]=b.coordinates;const approach=from[0]===origin.longitude;
  const features=approach?[{properties:{summary:{distance:11000,duration:1200},ascent:40,descent:30},geometry:lineFrom(origin,pickup)}]
   :[{properties:{summary:{distance:12000,duration:1500},ascent:20,descent:25},geometry:lineFrom(pickup,dest)},{properties:{summary:{distance:14500,duration:1380},ascent:35,descent:30},geometry:lineFrom(pickup,dest)}];
  return reply({type:'FeatureCollection',features});};
 const result=await legRoutes({origin,stops:[pickup,dest],specs},{apiKey:'k',fetcher});
 assert.equal(requests.length,2);
 const approachReq=requests.find(b=>b.coordinates[0][0]===origin.longitude),mainReq=requests.find(b=>b.coordinates[0][0]===pickup.longitude);
 assert.equal(approachReq.alternative_routes,undefined,'approach leg is a single route');assert.equal(approachReq.coordinates.length,2);
 assert.equal(mainReq.alternative_routes.target_count,3);assert.deepEqual(mainReq.coordinates,[[106.9,-6.19],[106.884,-6.104]]);
 assert.equal(result.provider,'ors');assert.equal(result.routes.length,2);
 // Ranked by total duration: 1200+1380 s → 43 min beats 1200+1500 s → 45 min.
 assert.deepEqual(result.routes.map(r=>[r.id,r.rank,r.distanceKm,r.durationMin]),[['ors-1',1,25.5,43],['ors-2',2,23,45]]);
 assert.equal(result.routes[0].ascendM,75);assert.equal(result.routes[0].descendM,60);
 assert.deepEqual(result.routes[0].polyline[0],[origin.latitude,origin.longitude]);assert.deepEqual(result.routes[0].polyline.at(-1),[dest.latitude,dest.longitude]);
 assert.equal(result.routes[0].polyline.length,3,'shared pickup point is not duplicated');
 assert.ok(result.routes.every(r=>r.warnings.some(w=>/dua bagian/.test(w))));
 // Driver already at the pickup (< 300 m): no approach leg, plain call.
 requests.length=0;
 const atPickup=await legRoutes({origin:{...origin,latitude:pickup.latitude+0.001,longitude:pickup.longitude},stops:[pickup,dest],specs},{apiKey:'k',fetcher:async(u,o)=>{requests.push(JSON.parse(o.body));return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:12000,duration:1500},ascent:20,descent:25},geometry:lineFrom(pickup,dest)}]});}});
 assert.equal(requests.length,1);assert.equal(requests[0].coordinates.length,2);assert.ok(atPickup.routes[0].warnings.every(w=>!/dua bagian/.test(w)));
 // Main leg without alternatives (multi-stop): no "two parts / alternatives" note, only the multi-stop reason.
 const third={address:'Kramat Jati',latitude:-6.27,longitude:106.87};
 const multi=await legRoutes({origin,stops:[pickup,third,dest],specs},{apiKey:'k',fetcher:async(u,o)=>{const b=JSON.parse(o.body);const [a,z]=[b.coordinates[0],b.coordinates.at(-1)];return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:15000,duration:1500},ascent:20,descent:25},geometry:{type:'LineString',coordinates:[a,z]}}]});}});
 assert.equal(multi.routes.length,1);assert.ok(!multi.routes[0].warnings.some(w=>/dua bagian/.test(w)));assert.ok(multi.routes[0].warnings.some(w=>/multi-stop/.test(w)));
 // Observed live (17 Oct): ORS 404 code 2009 when the driver's GPS sits among roads closed to trucks.
 // The approach leg retries on general roads and says so; the main leg keeps the truck profile and its alternatives.
 const urls=[];
 const truckLocked=await legRoutes({origin,stops:[pickup,dest],specs},{apiKey:'k',lang:'en',fetcher:async(u,o)=>{const b=JSON.parse(o.body);urls.push(u);
  if(u.includes('driving-hgv')&&b.coordinates[0][0]===origin.longitude)return reply({error:{code:2009,message:'Route could not be found - Unable to find a route between points 1 and 2.'}},false,404);
  if(u.includes('driving-car')){assert.equal(b.options,undefined,'no truck options on the car profile');return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:11000,duration:1200},ascent:40,descent:30},geometry:lineFrom(origin,pickup)}]});}
  return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:12000,duration:1500},ascent:20,descent:25},geometry:lineFrom(pickup,dest)},{properties:{summary:{distance:14500,duration:1380},ascent:35,descent:30},geometry:lineFrom(pickup,dest)}]});}});
 assert.equal(truckLocked.routes.length,2,'main-leg alternatives survive');
 assert.ok(urls.some(u=>u.endsWith('/driving-car/geojson')));
 assert.ok(truckLocked.routes.every(r=>r.warnings.some(w=>/first part .*general roads/i.test(w))));
 assert.deepEqual(truckLocked.routes[0].restrictions.checked,['height','width','length','weight'],'restrictions still describe the truck leg');
 // Single-leg trip with no truck-legal road: general roads, nothing marked as checked.
 const carOnly=await legRoutes({origin,stops:[dest],specs},{apiKey:'k',lang:'en',fetcher:async u=>u.includes('driving-hgv')?reply({error:{code:2010,message:'Could not find routable point'}},false,404):reply({type:'FeatureCollection',features:[{properties:{summary:{distance:16000,duration:1600},ascent:20,descent:25},geometry:lineFrom(origin,dest)}]})});
 assert.deepEqual(carOnly.routes[0].restrictions.checked,[]);assert.ok(carOnly.routes[0].restrictions.unknown.includes('height'));
 assert.ok(carOnly.routes[0].warnings.some(w=>/general roads/.test(w)));
 // Observed on a phone (17 Oct): Google Places put Soekarno-Hatta inside the terminal, ORS hgv answered 2009 for the
 // pickup → airport leg and the whole preview fell back to sample routes. That leg now uses general roads too, and says so.
 const airport=await legRoutes({origin,stops:[pickup,dest],specs},{apiKey:'k',lang:'en',fetcher:async(u,o)=>{const b=JSON.parse(o.body);
  if(u.includes('driving-hgv')&&b.coordinates[0][0]===pickup.longitude)return reply({error:{code:2009,message:'Route could not be found'}},false,404);
  return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:9000,duration:900},ascent:5,descent:5},geometry:b.coordinates[0][0]===origin.longitude?lineFrom(origin,pickup):lineFrom(pickup,dest)}]});}});
 assert.equal(airport.provider,'ors','real roads, not sample routes');
 assert.ok(airport.routes[0].warnings.some(w=>/No truck route was found/.test(w)));
 assert.deepEqual(airport.routes[0].restrictions.checked,[],'nothing claimed as checked on a general-roads leg');
 // Other provider errors are not masked by the car fallback.
 await assert.rejects(()=>legRoutes({origin,stops:[dest],specs},{apiKey:'k',fetcher:async()=>reply({error:{code:2003,message:'bad'}},false,400)}),/HTTP 400/);
 // Single destination: unchanged behaviour (one call).
 requests.length=0;
 await legRoutes({origin,stops:[dest],specs},{apiKey:'k',fetcher:async(u,o)=>{requests.push(JSON.parse(o.body));return reply({type:'FeatureCollection',features:[{properties:{summary:{distance:16000,duration:1600},ascent:20,descent:25},geometry:lineFrom(origin,dest)}]});}});
 assert.equal(requests.length,1);
});

const candidates=[{id:'ors-1',rank:1,distanceKm:152,durationMin:150,ascendM:650,descendM:420,tollIdr:null,restrictions:{checked:['height'],unknown:['truck_bans']},warnings:[]},{id:'ors-2',rank:2,distanceKm:148,durationMin:170,ascendM:500,descendM:380,tollIdr:null,restrictions:{checked:['height'],unknown:['truck_bans']},warnings:[]}];
const geminiReply=obj=>reply({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(obj)}]}}]});
const good={recommendedRouteId:'ors-1',summary:'Rute 1 lebih cepat 20 menit.',perRoute:[{routeId:'ors-1',headline:'Tercepat',pros:['20 menit lebih cepat'],cons:['Tanjakan lebih tinggi']},{routeId:'ors-2',headline:'Lebih pendek',pros:['4 km lebih pendek'],cons:['Lebih lambat']}],caveats:['Larangan truk tidak diverifikasi.']};

test('explainRoutes drops caveats that only repeat a route warning (observed: "Route calculated in two parts" shown twice)',async()=>{
 const twoParts='Route calculated in two parts: your location → first stop, then first stop → destination.';
 const warned=candidates.map(c=>({...c,warnings:[twoParts]}));
 const out=await explainRoutes({candidates:warned,specs,stops:[]},{apiKey:'g',model:'m',cache:new Map(),fetcher:async()=>geminiReply({...good,caveats:[` ${twoParts} `,'Larangan truk tidak diverifikasi.']})});
 assert.deepEqual(out.caveats,['Larangan truk tidak diverifikasi.']);
});

test('explainRoutes: structured Gemini output validated against candidate ids',async()=>{
 let request;
 const ok=await explainRoutes({candidates,specs,stops:[{address:'Bandung'}]},{apiKey:'g',model:'test-model',fetcher:async(url,options)=>{assert.match(url,/models\/test-model:generateContent$/);request=JSON.parse(options.body);return geminiReply(good);}});
 assert.equal(request.generationConfig.responseMimeType,'application/json');assert.ok(request.generationConfig.responseSchema);
 assert.match(request.systemInstruction.parts[0].text,/never invent|do not invent/i);
 assert.equal(ok.status,'ok');assert.equal(ok.recommendedRouteId,'ors-1');assert.equal(ok.model,'test-model');assert.equal(ok.perRoute.length,2);assert.ok(ok.generatedAt);
 const forged=await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',fetcher:async()=>geminiReply({...good,recommendedRouteId:'ors-9'})});
 assert.equal(forged.status,'unavailable');assert.equal(forged.recommendedRouteId,null);
 const stray=await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',fetcher:async()=>geminiReply({...good,perRoute:[...good.perRoute,{routeId:'ghost',headline:'x',pros:[],cons:[]}]})});
 assert.equal(stray.status,'unavailable');
 const bad=await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',fetcher:async()=>reply({candidates:[{content:{parts:[{text:'not json'}]}}]})});
 assert.equal(bad.status,'unavailable');assert.match(bad.summary,/tidak tersedia/i);
 let attempts=0;
 const http=await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',retryDelayMs:0,fetcher:async()=>{attempts++;return reply({},false,429);}});
 assert.equal(http.status,'unavailable');assert.equal(attempts,2,'429 is retried once');assert.match(http.summary,/kuota/);
 // Observed live: transient 503 (overloaded) — one retry recovers.
 let calls=0;
 const recovered=await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',retryDelayMs:0,cache:new Map(),fetcher:async()=>++calls===1?reply({},false,503):geminiReply(good)});
 assert.equal(recovered.status,'ok');assert.equal(calls,2);
 let once=0;
 await explainRoutes({candidates,specs,stops:[]},{apiKey:'g',model:'m',retryDelayMs:0,cache:new Map(),fetcher:async()=>{once++;return reply({},false,400);}});
 assert.equal(once,1,'non-transient errors are not retried');
 const none=await explainRoutes({candidates,specs,stops:[]},{apiKey:'',model:'m',fetcher:async()=>{throw new Error('must not call network');}});
 assert.equal(none.status,'not_configured');
});

test('explainRoutes sends readable restriction labels, not internal keys (observed: caveat echoed "bridge_limits")',async()=>{
 const bodies=[];
 const fetcher=async(u,o)=>{bodies.push(JSON.parse(JSON.parse(o.body).contents[0].parts[0].text));return geminiReply(good);};
 const restrictions={checked:['height','weight'],unknown:['axleload','bridge_limits','truck_bans']};
 const input={candidates:candidates.map(c=>({...c,restrictions})),specs,stops:[]};
 await explainRoutes({...input,lang:'en'},{apiKey:'g',model:'m',fetcher,cache:new Map()});
 await explainRoutes({...input,lang:'id'},{apiKey:'g',model:'m',fetcher,cache:new Map()});
 assert.deepEqual(bodies[0].routes[0].restrictions,{checked:['Height','Gross weight'],unknown:['Axle load','Bridge limits','Truck bans']});
 assert.deepEqual(bodies[1].routes[0].restrictions,{checked:['Tinggi','Berat total'],unknown:['Beban as','Batas jembatan','Larangan truk']});
});

test('explainRoutes cache: identical successful explanations reuse one Gemini call; failures are not cached',async()=>{
 const cache=new Map();let calls=0;
 const fetcher=async()=>{calls++;return geminiReply(good);};
 const input={candidates,specs,stops:[{address:'Bandung'}]};
 const first=await explainRoutes(input,{apiKey:'g',model:'m',fetcher,cache});
 const second=await explainRoutes(structuredClone(input),{apiKey:'g',model:'m',fetcher,cache});
 assert.equal(calls,1);assert.deepEqual(second,first);
 await explainRoutes(input,{apiKey:'g',model:'other-model',fetcher,cache});assert.equal(calls,2,'model is part of the key');
 await explainRoutes({...input,specs:{...specs,loadKg:9000,grossKg:17000}},{apiKey:'g',model:'m',fetcher,cache});assert.equal(calls,3,'truck load is part of the key');
 const failing=new Map();let failCalls=0;
 await explainRoutes(input,{apiKey:'g',model:'m',retryDelayMs:0,cache:failing,fetcher:async()=>{failCalls++;return reply({},false,400);}});
 await explainRoutes(input,{apiKey:'g',model:'m',retryDelayMs:0,cache:failing,fetcher:async()=>{failCalls++;return geminiReply(good);}});
 assert.equal(failCalls,2,'an unavailable result is retried on the next request');
 const expired=new Map();let expCalls=0;const now={t:0};
 const f2=async()=>{expCalls++;return geminiReply(good);};
 await explainRoutes(input,{apiKey:'g',model:'m',fetcher:f2,cache:expired,clock:()=>now.t});now.t=31*60*1000;
 await explainRoutes(input,{apiKey:'g',model:'m',fetcher:f2,cache:expired,clock:()=>now.t});
 assert.equal(expCalls,2,'entries expire after 30 minutes');
});

test('lang en: driver-facing route warnings, errors and the AI explanation are in English',async()=>{
 const stops=[{address:'Bandung'}],approxGeo=reply({features:[{geometry:{coordinates:[107.6098,-6.9147]},properties:{confidence:0.6,label:'Bandung, JR, Indonesia',layer:'locality',match_type:'fallback'}}]});
 let geminiRequest;
 const fetcher=async(url,options)=>String(url).includes('/geocode/')?approxGeo:String(url).includes('/v2/directions/')?reply(geojson([168200,8640,2495,1818])):(geminiRequest=JSON.parse(options.body),geminiReply({...good,perRoute:[good.perRoute[0]]}));
 const en=await previewRoutes({origin,specs,stops,lang:'en'},{orsKey:'k',gemini:{apiKey:'g',model:'m-en'},fetcher});
 const warnings=en.body.routes[0].warnings.join(' | ');
 assert.match(warnings,/only for short trips/);assert.match(warnings,/Stop 1 \(Bandung\) was only found as "Bandung, JR, Indonesia"/);assert.doesNotMatch(warnings,/hanya|perkiraan/);
 assert.match(geminiRequest.systemInstruction.parts[0].text,/Write in English/);assert.equal(en.body.explanation.status,'ok');
 const miss=await previewRoutes({origin,specs,stops,lang:'en'},{orsKey:'k',gemini:null,fetcher:async()=>reply({features:[]})});
 assert.equal(miss.status,422);assert.match(miss.body.error,/^Location not found on the map: Bandung/);
 const fixture=await previewRoutes({origin,specs,stops,lang:'en'},{orsKey:'',gemini:null,fetcher});
 assert.ok(fixture.body.routes.every(r=>r.warnings.some(w=>/^Sample route/.test(w))));assert.match(fixture.body.explanation.summary,/not configured/i);
 const down=await explainRoutes({candidates,specs,stops:[],lang:'en'},{apiKey:'g',model:'m',retryDelayMs:0,cache:new Map(),fetcher:async()=>reply({},false,429)});
 assert.equal(down.summary,'AI explanation unavailable (Gemini quota exceeded). Route figures still come from the provider.');
 // Default stays Indonesian; same input in another language is a separate cache entry.
 const id=await previewRoutes({origin,specs,stops},{orsKey:'k',gemini:{apiKey:'g',model:'m-en'},fetcher});
 assert.match(id.body.routes[0].warnings.join(' '),/hanya ditemukan/);assert.match(geminiRequest.systemInstruction.parts[0].text,/Write in Bahasa Indonesia/);
});

test('previewRoutes: ORS → explainer; geocode miss → 422; ORS down → fixture; both down → 503',async()=>{
 const stops=[{address:'Bandung'}];
 const geo=reply({features:[{geometry:{coordinates:[107.6098,-6.9147]},properties:{confidence:0.9,label:'Bandung, ID'}}]});
 const okFetcher=async(url,options)=>String(url).includes('/geocode/')?geo:String(url).includes('/v2/directions/')?reply(geojson([152000,9000,650,420],[148000,10200,500,380])):geminiReply(good);
 const live=await previewRoutes({origin,specs,stops},{orsKey:'k',gemini:{apiKey:'g',model:'m'},fetcher:okFetcher});
 assert.equal(live.status,200);assert.equal(live.body.routing.provider,'ors');assert.equal(live.body.routing.status,'ok');assert.ok(live.body.routing.computedAt);
 assert.deepEqual(live.body.origin,{latitude:origin.latitude,longitude:origin.longitude});
 assert.equal(live.body.stops[0].latitude,-6.9147);assert.equal(live.body.routes.length,2);
 assert.equal(live.body.explanation.status,'ok');assert.equal(live.body.routes.find(r=>r.id==='ors-1').recommended,true);assert.equal(live.body.routes.find(r=>r.id==='ors-2').recommended,false);
 assert.equal(live.body.stops[0].geocodePrecision,'approximate','mock geocode has no layer → not exact');
 assert.ok(live.body.routes.every(r=>r.warnings.some(w=>/Stop 1 \(Bandung\).*perkiraan/.test(w))),'approximate stops are warned on every route');
 const preciseGeo=reply({features:[{geometry:{coordinates:[107.6098,-6.9147]},properties:{confidence:1,label:'Gudang X, Bandung',layer:'venue',match_type:'exact'}}]});
 const precise=await previewRoutes({origin,specs,stops},{orsKey:'k',gemini:null,fetcher:async url=>String(url).includes('/geocode/')?preciseGeo:okFetcher(url)});
 assert.equal(precise.body.stops[0].geocodePrecision,'exact');assert.ok(precise.body.routes.every(r=>!r.warnings.some(w=>/perkiraan/.test(w))));
 const miss=await previewRoutes({origin,specs,stops},{orsKey:'k',gemini:null,fetcher:async url=>String(url).includes('/geocode/')?reply({features:[]}):okFetcher(url)});
 assert.equal(miss.status,422);assert.match(miss.body.error,/Bandung/);assert.equal(miss.body.stops[0].latitude,null);
 const down=await previewRoutes({origin,specs,stops},{orsKey:'k',gemini:null,fetcher:async url=>String(url).includes('/geocode/')?geo:reply({},false,502)});
 assert.equal(down.status,200);assert.equal(down.body.routing.provider,'fixture');assert.equal(down.body.explanation.status,'not_configured');
 // The backend recommends even without AI: fastest here, since no cost inputs were given.
 assert.equal(down.body.routes.filter(r=>r.recommended).length,1);assert.equal(down.body.recommendation.basis,'time');
 const nokey=await previewRoutes({origin,specs,stops},{orsKey:'',gemini:null,fetcher:async()=>{throw new Error('must not call network');}});
 assert.equal(nokey.status,200);assert.equal(nokey.body.routing.provider,'fixture');assert.equal(nokey.body.stops[0].latitude,null);
 assert.deepEqual(routeStops([{address:' Bandung '}]),[{address:'Bandung'}]);
 // An order allows 10 delivery stops plus its pickup, so the order path accepts 11 points.
 assert.equal(routeStops(Array.from({length:11},(_,i)=>({address:`s${i}`})),11).length,11);
 assert.throws(()=>routeStops([]),/1–10/);assert.throws(()=>routeStops([{address:''}]),/address/i);assert.throws(()=>routeStops(Array.from({length:11},()=>({address:'x'}))),/1–10/);
});
