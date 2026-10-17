import {readFile} from 'node:fs/promises';
import {haversine} from './trips.js';
import {explainRoutes} from './route-explainer.js';
import {messages} from './route-messages.js';
import {googleGeocode,googleRouteTolls} from './google-maps.js';
import {suggestStopOrder} from './stop-order.js';

export const RESTRICTION_KEYS=['height','width','length','weight','axleload','hazmat','bridge_limits','truck_bans','time_restrictions'];
const fixtures=JSON.parse(await readFile(new URL('./route-fixtures.json',import.meta.url),'utf8'));
const round=(v,d=1)=>Math.round(v*10**d)/10**d;
const latLng=p=>[p.latitude,p.longitude];

// Demo-only candidates. Clearly labelled; never mixed with live provider output.
export function fixtureRoutes({origin,stops,lang}){
 const t=messages(lang);
 const points=[origin,...stops.map(s=>s.latitude===null||s.longitude===null?fixtures.defaultDestination:s)];
 const straightKm=points.slice(1).reduce((sum,p,i)=>sum+haversine(points[i],p),0)||5;
 const routes=fixtures.variants.map(v=>{const distanceKm=round(straightKm*v.distanceFactor),durationMin=Math.round(distanceKm/v.speedKmh*60);
  return {id:v.id,rank:0,distanceKm,durationMin,roadCondition:null,polyline:points.map(latLng),ascendM:v.ascendM,descendM:v.descendM,tollIdr:null,restrictions:{checked:[],unknown:[...RESTRICTION_KEYS]},warnings:[t.fixture(t.fixtureLabels[v.id]||v.label)],recommended:false};})
  .sort((a,b)=>a.durationMin-b.durationMin).map((r,i)=>({...r,rank:i+1}));
 return {provider:'fixture',status:'fixture',routes};
}

const ORS='https://api.openrouteservice.org';
export async function geocodeStops(addresses,origin,{apiKey,fetcher=fetch}){
 if(!apiKey)throw new Error('Route provider is not configured. Set ORS_API_KEY and restart.');
 return Promise.all(addresses.map(async address=>{
  const url=new URL('/geocode/search',ORS);
  for(const [k,v] of Object.entries({api_key:apiKey,text:address,'boundary.country':'ID',size:'1','focus.point.lat':origin.latitude,'focus.point.lon':origin.longitude}))url.searchParams.set(k,String(v));
  const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Route provider geocoding returned HTTP ${response.status}. Check ORS_API_KEY and quota.`);
  const feature=(await response.json()).features?.[0],coords=feature?.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))return blankStop(address);
  const p=feature.properties||{},confidence=Number(p.confidence),layer=typeof p.layer==='string'?p.layer:null;
  // Pelias confidence is unreliable for Indonesian street addresses: a street that falls back to the city centroid still scores 0.6.
  const precision=PRECISE_LAYERS.includes(layer)&&p.match_type!=='fallback'?'exact':'approximate';
  return {address,latitude:coords[1],longitude:coords[0],geocodeConfidence:Number.isFinite(confidence)?confidence:null,geocodeLabel:typeof p.label==='string'?p.label:null,geocodePrecision:precision,geocodeLayer:layer};
 }));
}
const PRECISE_LAYERS=['venue','address','street'];
export const blankStop=address=>({address,latitude:null,longitude:null,geocodeConfidence:null,geocodeLabel:null,geocodePrecision:null,geocodeLayer:null});

const UNKNOWN_ALWAYS=['bridge_limits','truck_bans','time_restrictions'];
// Road condition from OpenStreetMap tags (ORS extra_info). In Jakarta most surfaces are asphalt/concrete or untagged;
// untagged stays "unknown" and is never counted as good or bad road.
const PAVED=new Set([1,3,4,14]),ROUGH=new Set([2,5,8,9,10,11,12,15,17,18]);
const sumKm=(summary,pick)=>round((summary||[]).filter(s=>pick(s.value)).reduce((t,s)=>t+(Number(s.distance)||0),0)/1000);
export function roadCondition(extras,distanceKm){
 const surface=extras?.surface?.summary;
 const pavedKm=sumKm(surface,v=>PAVED.has(v)),roughKm=sumKm(surface,v=>ROUGH.has(v));
 return {pavedKm,roughKm,unknownKm:surface?sumKm(surface,v=>!PAVED.has(v)&&!ROUGH.has(v)):round(distanceKm),steepKm:sumKm(extras?.steepness?.summary,v=>Math.abs(v)>=3),ferryKm:sumKm(extras?.waytype?.summary,v=>v===9)};
}
const addCondition=(a,b)=>a&&b?Object.fromEntries(Object.keys(a).map(k=>[k,round(a[k]+b[k])])):null;
// The public ORS alternative-routes algorithm rejects routes over 100 km road distance (error 2004); 70 km straight-line keeps a margin.
export const ALTERNATIVES_MAX_STRAIGHT_KM=70;
export async function orsRoutes({origin,stops,specs},{apiKey,fetcher=fetch,alternatives=true,lang,profile='driving-hgv'}){
 if(!apiKey)throw new Error('Route provider is not configured. Set ORS_API_KEY and restart.');
 if(stops.some(s=>s.latitude===null||s.longitude===null))throw new Error('Every stop needs coordinates before routing.');
 const t=messages(lang);
 const points=[origin,...stops],coordinates=points.map(p=>[p.longitude,p.latitude]);
 const straightKm=points.slice(1).reduce((sum,p,i)=>sum+haversine(points[i],p),0);
 const hazmat=specs.hazmat!=='none';
 // Truck without master specs: still an HGV route, but no restriction is sent or claimed as checked.
 const known=Number.isFinite(specs.heightM)&&Number.isFinite(specs.grossKg);
 // Per-axle load is not declared by the driver, so it is not sent and stays listed as unknown.
 const restrictions=known?{height:specs.heightM,width:specs.widthM,length:specs.lengthM,weight:round(specs.grossKg/1000,2),...(hazmat?{hazmat:true}:{})}:null;
 const truck=profile==='driving-hgv',checks=truck&&known;
 const request=(alternatives,timeout)=>fetcher(`${ORS}/v2/directions/${profile}/geojson`,{method:'POST',headers:{'content-type':'application/json',Authorization:apiKey},signal:AbortSignal.timeout(timeout),body:JSON.stringify({coordinates,elevation:true,instructions:false,extra_info:['surface','waytype','steepness'],...(truck?{options:{vehicle_type:'hgv',...(restrictions?{profile_params:{restrictions}}:{})}}:{}),...(alternatives?{alternative_routes:{target_count:3,share_factor:0.6,weight_factor:1.6}}:{})})});
 const warnings=[];
 let response=null;
 // ORS explains failures in error.code/message (e.g. 2010 "could not find routable point"); keep them in the error.
 const failure=async res=>{const e=(await res.json().catch(()=>({}))).error||{};const error=Object.assign(new Error(`Route provider returned HTTP ${res.status}${e.code?` (code ${e.code}: ${String(e.message||'').slice(0,200)})`:''}. Check ORS_API_KEY, quota, and that the stops are reachable by road.`),{orsCode:e.code??null});return {code:e.code??null,error};};
 // alternatives=false: caller (approach leg) wants one route and no warning about it.
 if(alternatives&&coordinates.length>2)warnings.push(t.noAlternativesMulti);
 else if(alternatives&&straightKm>ALTERNATIVES_MAX_STRAIGHT_KM)warnings.push(t.noAlternativesLong);
 else if(alternatives){
  try{response=await request(true,20000);}catch(e){if(e.name!=='TimeoutError')throw e;}
  if(response&&!response.ok){const f=await failure(response);if(f.code!==2004)throw f.error;}
  if(!response?.ok){response=null;warnings.push(t.noAlternativesFailed);}
 }
 response??=await request(false,30000);
 if(!response.ok)throw (await failure(response)).error;
 const features=(await response.json()).features;
 if(!Array.isArray(features)||!features.length)throw new Error('Route provider found no route between these points.');
 const checked=checks?['height','width','length','weight',...(hazmat?['hazmat']:[])]:[],unknown=checks?['axleload',...(hazmat?[]:['hazmat']),...UNKNOWN_ALWAYS]:[...RESTRICTION_KEYS];
 const mapped=features.map(f=>{const s=f.properties?.summary||{};if(!Number.isFinite(s.distance)||s.distance<=0||!Number.isFinite(s.duration))throw new Error('Route provider returned an incomplete route summary.');
  return {distanceKm:round(s.distance/1000),durationMin:Math.round(s.duration/60),roadCondition:roadCondition(f.properties?.extras,s.distance/1000),polyline:f.geometry.coordinates.map(([lng,lat])=>[lat,lng]),ascendM:Number.isFinite(f.properties?.ascent)?Math.round(f.properties.ascent):null,descendM:Number.isFinite(f.properties?.descent)?Math.round(f.properties.descent):null,tollIdr:null,restrictions:{checked,unknown},warnings:[...warnings],recommended:false};});
 // A point snapped to water or the wrong island yields absurd detours (observed: 3108 km for a 40 km trip). Drop those.
 const limitKm=Math.max(straightKm*3,straightKm+30),plausible=mapped.filter(r=>r.distanceKm<=limitKm);
 if(!plausible.length)throw new Error(`Route provider returned an implausible route (${mapped[0].distanceKm} km for ${round(straightKm)} km straight-line). Check the stop locations.`);
 // Observed live: ORS can return the same alternative twice. Collapse candidates within 0.2 km and 1 minute.
 const distinct=plausible.sort((a,b)=>a.durationMin-b.durationMin).filter((r,i,all)=>!all.slice(0,i).some(p=>Math.abs(p.distanceKm-r.distanceKm)<=0.2&&Math.abs(p.durationMin-r.durationMin)<=1));
 const routes=distinct.map((r,i)=>({id:`ors-${i+1}`,rank:i+1,...r}));
 return {provider:'ors',status:'ok',routes};
}

// ORS gives no alternatives for multi-waypoint requests, and order trips always have GPS origin → pickup → destination.
// Route the approach leg (origin → first stop) once and the main leg (first stop → rest) with alternatives, then stitch.
const SAME_POINT_KM=0.3;
// Observed live: ORS returns 2009/2010 when a point sits among truck-closed roads (estates, campuses, and an airport
// terminal found by Google Places). That leg falls back to general roads and says so, instead of sample routes.
const NO_TRUCK_ROAD=new Set([2009,2010]);
async function withGeneralRoadsFallback(input,options,warning){
 try{return await orsRoutes(input,options);}
 catch(e){
  if(!NO_TRUCK_ROAD.has(e.orsCode))throw e;
  const car=await orsRoutes(input,{...options,profile:'driving-car'});
  car.routes.forEach(r=>r.warnings.unshift(warning));
  return car;
 }
}
export async function legRoutes({origin,stops,specs},options){
 const t=messages(options.lang);
 if(stops.length<2)return withGeneralRoadsFallback({origin,stops,specs},options,t.generalRoadsOnly);
 if(stops.some(s=>s.latitude===null||s.longitude===null))throw new Error('Every stop needs coordinates before routing.');
 if(haversine(origin,stops[0])<SAME_POINT_KM)return withGeneralRoadsFallback({origin:stops[0],stops:stops.slice(1),specs},options,t.generalRoadsOnly);
 const [approach,main]=await Promise.all([withGeneralRoadsFallback({origin,stops:[stops[0]],specs},{...options,alternatives:false},t.approachGeneralRoads),withGeneralRoadsFallback({origin:stops[0],stops:stops.slice(1),specs},options,t.generalRoadsOnly)]);
 const lead=approach.routes[0],sum=(a,b)=>a===null||b===null?null:a+b,twoLegs=t.twoLegs;
 const routes=main.routes.map(r=>({distanceKm:round(lead.distanceKm+r.distanceKm),durationMin:lead.durationMin+r.durationMin,roadCondition:addCondition(lead.roadCondition,r.roadCondition),polyline:[...lead.polyline,...r.polyline.slice(1)],ascendM:sum(lead.ascendM,r.ascendM),descendM:sum(lead.descendM,r.descendM),tollIdr:null,restrictions:r.restrictions,warnings:[...new Set([...(main.routes.length>1?[twoLegs]:[]),...lead.warnings,...r.warnings])],recommended:false}))
  .sort((a,b)=>a.durationMin-b.durationMin).map((r,i)=>({id:`ors-${i+1}`,rank:i+1,...r}));
 return {provider:'ors',status:'ok',routes};
}

// Maintenance = historical CPK × km, rough km × the admin's uncalibrated factor (reported); fuel = order km/l and IDR/l.
// Toll (Google) joins the totals only when every route's toll is known, so routes are compared on the same parts.
export function routeCosts(routes,{cpk=null,fuel=null,roughRoadFactor=null}={}){
 const eff=fuel?.efficiencyKmPerLiter??null,price=fuel?.priceIdrPerLiter??null;
 const tollIncluded=routes.every(r=>Number.isFinite(r.tollIdr));
 const priced=routes.map(r=>{
  const roughKm=r.roadCondition?.roughKm??0,factorApplied=cpk!==null&&roughRoadFactor!==null&&roughKm>0;
  const maintenanceCost=cpk===null?null:Math.round(cpk*(r.distanceKm-roughKm)+cpk*(factorApplied?roughRoadFactor:1)*roughKm);
  const fuelCost=eff&&price?Math.round(r.distanceKm/eff*price):null,tollCost=Number.isFinite(r.tollIdr)?r.tollIdr:null;
  const totalCost=maintenanceCost===null||fuelCost===null?null:maintenanceCost+fuelCost+(tollIncluded?tollCost:0);
  return {...r,cost:{maintenanceCost,fuelCost,tollCost,tollIncluded,totalCost,tripCpk:totalCost===null?null:Math.round(totalCost/r.distanceKm),roughRoadFactor,factorApplied}};
 });
 const byCost=priced.every(r=>r.cost.totalCost!==null);
 const best=[...priced].sort((a,b)=>byCost?a.cost.totalCost-b.cost.totalCost||a.durationMin-b.durationMin:a.durationMin-b.durationMin)[0];
 // One route: nothing was compared, so neither "lowest cost" nor "fastest" may be claimed.
 return {routes:priced,recommendedId:best?.id??null,basis:priced.length===1?'only':byCost?'cost':'time'};
}

export function routeStops(value,max=10){
 if(!Array.isArray(value)||value.length<1||value.length>max)throw new Error(`Provide 1–${max} destination stops.`);
 return value.map(s=>{const address=typeof s?.address==='string'?s.address.trim():'';if(!address||address.length>300)throw new Error('Each stop needs an address under 300 characters.');return {address};});
}

// Returns {status, body} ready for json(). Provider failure degrades to fixtures; explanation failure never hides routes.
// stopOrderInfo: stops arrive in the applied order. applied[i] = entered index of orderable stop i; notes align with stops;
// fixedFirst = 1 when stops[0] is the order pickup (never reordered).
export async function previewRoutes({origin,specs,stops,lang},{orsKey,googleKey=null,gemini,fetcher=fetch,cpk=null,fuel=null,roughRoadFactor=null,stopOrderInfo=null,stopOrderCache}){
 const t=messages(lang);
 let resolved=stops.map(s=>blankStop(s.address)),result=null,providerError=null,suggestion=null;
 if(orsKey){
  try{
   // Google Places finds Indonesian places far better than ORS geocoding; ORS stays the fallback.
   const addresses=stops.map(s=>s.address);
   resolved=googleKey?await googleGeocode(addresses,origin,{apiKey:googleKey,fetcher}).catch(e=>{console.warn(`Google geocoding failed, using ORS: ${e.message}`);return null;}):null;
   resolved??=await geocodeStops(addresses,origin,{apiKey:orsKey,fetcher});
   const missing=resolved.filter(s=>s.latitude===null);
   if(missing.length)return {status:422,body:{error:t.notFound(missing.map(s=>s.address).join('; ')),stops:resolved}};
   const first=stopOrderInfo?.fixedFirst??0,orderable=resolved.slice(first);
   const suggest=googleKey&&stopOrderInfo&&orderable.length>=2
    ?suggestStopOrder({stops:orderable.map((s,i)=>({address:s.address,notes:stopOrderInfo.notes?.[first+i]||'',latitude:s.latitude,longitude:s.longitude})),start:first?resolved[0]:origin,lang},{mapsKey:googleKey,gemini,fetcher,...(stopOrderCache?{cache:stopOrderCache}:{})}).catch(e=>{console.warn(`Stop order suggestion failed: ${e.message}`);return null;})
    :null;
   [result,suggestion]=await Promise.all([legRoutes({origin,stops:resolved,specs},{apiKey:orsKey,fetcher,lang}),suggest]);
  }catch(e){providerError=e.message;result=null;console.warn(`Route preview fell back to sample routes: ${e.message}`);}
 }
 if(result?.provider==='ors'&&googleKey){
  const extra=await googleRouteTolls(result.routes,{apiKey:googleKey,fetcher});
  result.routes.forEach((r,i)=>Object.assign(r,extra[i]));
 }
 if(!result){
  try{result=fixtureRoutes({origin,stops:resolved,specs,lang});}
  catch(e){return {status:503,body:{error:t.allFailed(providerError)}};}
  if(providerError)result.routes.forEach(r=>r.warnings.unshift(t.providerFailed(providerError)));
 }
 const approximate=resolved.map((s,i)=>s.geocodePrecision==='approximate'?t.approximate(i+1,s.address,s.geocodeLabel):null).filter(Boolean);
 if(approximate.length)result.routes.forEach(r=>r.warnings.push(...approximate));
 if(!Number.isFinite(specs?.heightM))result.routes.forEach(r=>r.warnings.unshift(t.specsMissing));
 // The backend recommends (cheapest, or fastest when cost is unknown); Gemini only explains that choice.
 const priced=routeCosts(result.routes,{cpk,fuel,roughRoadFactor});
 const routes=priced.routes.map(r=>({...r,recommended:r.id===priced.recommendedId}));
 const explanation=await explainRoutes({candidates:routes,specs,stops:resolved,lang,recommendedRouteId:priced.recommendedId,basis:priced.basis},{apiKey:gemini?.apiKey,model:gemini?.model,fetcher});
 // Suggestion indices are positions in the applied order; the client works in entered indices.
 // A Gemini check that keeps the current order is still returned: it shows the driver why the fastest order was refused.
 const applied=stopOrderInfo?.applied??null,mapped=applied&&suggestion?suggestion.order.map(i=>applied[i]):null;
 const keep=mapped&&(suggestion.source==='gemini'||mapped.some((v,i)=>v!==applied[i]));
 const stopOrder=applied?{applied,suggestion:keep?{order:mapped,basis:suggestion.basis,reason:suggestion.reason,source:suggestion.source,minutes:{applied:suggestion.minutes.asEntered,suggested:suggestion.minutes.suggested,fastest:suggestion.minutes.fastest??null}}:null}:null;
 return {status:200,body:{routing:{provider:result.provider,status:result.status,priority:'fastest',tollsAllowed:true,computedAt:new Date().toISOString()},origin:{latitude:origin.latitude,longitude:origin.longitude},stops:resolved,routes,recommendation:{routeId:priced.recommendedId,basis:priced.basis},explanation,stopOrder}};
}
