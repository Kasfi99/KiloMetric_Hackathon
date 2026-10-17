// Live probe for the Google Maps integration (Places, Geocoding, Routes tolls). Never commit its output.
// Run: node --env-file=.env scripts/verify-google-maps.mjs
const key=process.env.MAPS_API_KEY,ors=process.env.ORS_API_KEY;
if(!key){console.error('Set MAPS_API_KEY');process.exit(1);}
const addresses=['Kawasan Industri Pulogadung, Jakarta Timur','Jakarta International Container Terminal, Tanjung Priok','Bandara Soekarno-Hatta, Tangerang','Kawasan Berikat Nusantara, Cakung','Pasar Induk Kramat Jati, Jakarta Timur','Pelabuhan Tanjung Priok','Jl. Raya Bekasi KM 21, Cakung'];
const timed=async(label,fn)=>{const t=Date.now();try{const r=await fn();console.log(`  [${Date.now()-t} ms]`,label,r);return r;}catch(e){console.log(`  [${Date.now()-t} ms]`,label,'ERROR',e.message);}};
const post=async(url,body,mask)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw new Error(`HTTP ${r.status} ${j.error?.status} ${j.error?.message?.slice(0,160)}`);return j;};

console.log('H1 Places Text Search (New)');
const places={};
for(const a of addresses)places[a]=await timed(a,async()=>{const j=await post('https://places.googleapis.com/v1/places:searchText',{textQuery:a,regionCode:'ID',languageCode:'id',pageSize:1},'places.displayName,places.formattedAddress,places.location,places.types,places.primaryType');const p=j.places?.[0];return p&&{name:p.displayName?.text,address:p.formattedAddress,lat:p.location?.latitude,lng:p.location?.longitude,primary:p.primaryType,types:p.types?.slice(0,4).join(',')};});

console.log('\nH2 Geocoding API');
for(const a of addresses)await timed(a,async()=>{const r=await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({address:a,region:'id',language:'id',key})}`,{signal:AbortSignal.timeout(15000)});const j=await r.json();if(j.status!=='OK')throw new Error(`${j.status} ${j.error_message||''}`);const g=j.results[0];return {address:g.formatted_address,lat:g.geometry.location.lat,lng:g.geometry.location.lng,type:g.geometry.location_type,partial:!!g.partial_match,types:g.types.slice(0,3).join(',')};});

const ll=p=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
const from=places[addresses[0]],to=places[addresses[1]];
const routeMask='routes.distanceMeters,routes.duration,routes.staticDuration,routes.travelAdvisory.tollInfo,routes.routeLabels';
const toll=r=>JSON.stringify(r.travelAdvisory?.tollInfo??'(no tollInfo)');
if(from&&to){
 console.log('\nH3 Routes API Pulogadung → JICT, DRIVE, traffic, tolls');
 for(const [label,mods] of [['with ID_E_TOLL',{vehicleInfo:{emissionType:'DIESEL'},tollPasses:['ID_E_TOLL']}],['without toll pass',{vehicleInfo:{emissionType:'DIESEL'}}]])
  await timed(label,async()=>{const j=await post('https://routes.googleapis.com/directions/v2:computeRoutes',{origin:ll(from),destination:ll(to),travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',computeAlternativeRoutes:true,extraComputations:['TOLLS'],routeModifiers:mods,languageCode:'id-ID'},routeMask);return j.routes.map(r=>`${(r.distanceMeters/1000).toFixed(1)} km, ${r.duration} (no traffic ${r.staticDuration}), toll ${toll(r)}`).join(' | ');});
 if(ors){
  console.log('\nH4 Toll for an ORS truck route by forcing Google through ORS via points');
  const orsRes=await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson',{method:'POST',headers:{'content-type':'application/json',Authorization:ors},body:JSON.stringify({coordinates:[[from.lng,from.lat],[to.lng,to.lat]],alternative_routes:{target_count:2,share_factor:0.6,weight_factor:1.6}}),signal:AbortSignal.timeout(25000)});
  const orsJson=await orsRes.json();
  for(const [i,f] of (orsJson.features||[]).entries()){
   const c=f.geometry.coordinates,n=Math.min(10,c.length-2),via=Array.from({length:n},(_,k)=>c[Math.round((k+1)*(c.length-1)/(n+1))]).map(([lng,lat])=>({via:true,...ll({lat,lng})}));
   await timed(`ORS route ${i+1} (${(f.properties.summary.distance/1000).toFixed(1)} km, ${n} via points)`,async()=>{const j=await post('https://routes.googleapis.com/directions/v2:computeRoutes',{origin:ll(from),destination:ll(to),intermediates:via,travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',extraComputations:['TOLLS'],routeModifiers:{vehicleInfo:{emissionType:'DIESEL'},tollPasses:['ID_E_TOLL']}},routeMask);const r=j.routes[0];return `Google follows: ${(r.distanceMeters/1000).toFixed(1)} km, ${r.duration}, toll ${toll(r)}`;});
  }
 }
}
