// Google Maps Platform for places, tolls and traffic. Google has no truck routing in Indonesia
// (large-vehicle routing covers only the contiguous US and Japan), so the route itself stays with ORS.

// Results this coarse mean "somewhere in the area", not the place asked for.
// Observed live: "Pelabuhan Tanjung Priok" came back as a natural_feature point.
const COARSE=new Set(['locality','sublocality','sublocality_level_1','administrative_area_level_1','administrative_area_level_2','administrative_area_level_3','administrative_area_level_4','political','postal_code','country','colloquial_area','natural_feature','route']);

// origin (optional) biases results toward the driver's position; orders estimated without one search all of Indonesia.
export async function googleGeocode(addresses,origin,{apiKey,fetcher=fetch}){
 return Promise.all(addresses.map(async address=>{
  const response=await fetcher('https://places.googleapis.com/v1/places:searchText',{method:'POST',signal:AbortSignal.timeout(10000),
   headers:{'content-type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'places.displayName,places.shortFormattedAddress,places.formattedAddress,places.location,places.primaryType,places.types'},
   body:JSON.stringify({textQuery:address,regionCode:'ID',languageCode:'id',pageSize:1,...(origin?{locationBias:{circle:{center:{latitude:origin.latitude,longitude:origin.longitude},radius:50000}}}:{})})});
  if(!response.ok)throw new Error(`Google Places returned HTTP ${response.status}. Check MAPS_API_KEY, Places API (New) access and billing.`);
  const p=(await response.json()).places?.[0],lat=p?.location?.latitude,lng=p?.location?.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return {address,latitude:null,longitude:null,geocodeConfidence:null,geocodeLabel:null,geocodePrecision:null,geocodeLayer:null,geocodeSource:'google'};
  // The full address runs to RT/RW and postcode (observed: cut off on screen); the short form is enough to recognise the place.
  const name=p.displayName?.text||'',formatted=p.shortFormattedAddress||p.formattedAddress||'',types=[p.primaryType,...(p.types||[])].filter(Boolean);
  const label=(name&&formatted&&!formatted.startsWith(name)?`${name}, ${formatted}`:formatted||name).slice(0,200)||null;
  return {address,latitude:lat,longitude:lng,geocodeConfidence:null,geocodeLabel:label,geocodePrecision:types.length&&!types.some(t=>COARSE.has(t))?'exact':'approximate',geocodeLayer:p.primaryType||types[0]||null,geocodeSource:'google'};
 }));
}

// Google returns no tollInfo when the route has no toll roads, and tollInfo without a price when the price is unknown.
function tollFrom(tollInfo){
 if(tollInfo===undefined)return 0;
 const prices=tollInfo?.estimatedPrice;
 if(!Array.isArray(prices)||!prices.length||!prices.every(p=>p.currencyCode==='IDR'))return null;
 const total=prices.reduce((sum,p)=>sum+Number(p.units||0)+Number(p.nanos||0)/1e9,0);
 return Number.isFinite(total)&&total>=0?Math.round(total):null;
}

// Prices the toll and traffic time of each ORS route by making Google drive through points sampled from it.
// Observed live: Google sometimes detours anyway (12.5 km → 21.4 km); then its toll belongs to another road and stays unknown.
// 25 is the Routes API maximum; with 10 points Google still left one ORS route (observed on Pulogadung → Soekarno-Hatta).
const VIA_POINTS=25,MATCH_RATIO=0.1,MATCH_MIN_KM=1;
const unknown={tollIdr:null,trafficDurationMin:null};
export async function googleRouteTolls(routes,{apiKey,fetcher=fetch}){
 return Promise.all(routes.map(async r=>{
  try{
   const line=r.polyline,point=([latitude,longitude])=>({location:{latLng:{latitude,longitude}}});
   const n=Math.min(VIA_POINTS,Math.max(0,line.length-2)),via=Array.from({length:n},(_,k)=>({via:true,...point(line[Math.round((k+1)*(line.length-1)/(n+1))])}));
   const response=await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{'content-type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.travelAdvisory.tollInfo'},
    body:JSON.stringify({origin:point(line[0]),destination:point(line.at(-1)),intermediates:via,travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',extraComputations:['TOLLS'],routeModifiers:{vehicleInfo:{emissionType:'DIESEL'},tollPasses:['ID_E_TOLL']}})});
   if(!response.ok)return unknown;
   const g=(await response.json()).routes?.[0],km=g?.distanceMeters/1000;
   if(!Number.isFinite(km)||Math.abs(km-r.distanceKm)>Math.max(r.distanceKm*MATCH_RATIO,MATCH_MIN_KM))return unknown;
   const seconds=typeof g.duration==='string'&&/^\d+(\.\d+)?s$/.test(g.duration)?Number(g.duration.slice(0,-1)):null;
   return {tollIdr:tollFrom(g.travelAdvisory?.tollInfo),trafficDurationMin:seconds===null?null:Math.round(seconds/60)};
  }catch{return unknown;}
 }));
}
