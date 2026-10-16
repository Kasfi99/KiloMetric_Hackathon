// Hypothesis check: ORS driving-hgv can return per-segment road condition (surface, waytype, steepness)
// via `extra_info`, so route candidates can be compared on road quality from real OSM data.
// Run: node --env-file=.env scripts/verify-ors-road-condition.mjs
const key=process.env.ORS_API_KEY;if(!key){console.error('Set ORS_API_KEY');process.exit(1);}
const alt=process.env.ALT==='1';
// FROM/TO="lng,lat" (default: Kawasan Industri Pulogadung → Bandara Soekarno-Hatta cargo area)
const pt=(v,d)=>(v||d).split(',').map(Number);
const body={coordinates:[pt(process.env.FROM,'106.9,-6.19'),pt(process.env.TO,'106.6559,-6.1256')],...(alt?{alternative_routes:{target_count:3,share_factor:0.6,weight_factor:1.6}}:{}),extra_info:['surface','waytype','steepness'],elevation:true,instructions:false,options:{vehicle_type:'hgv',profile_params:{restrictions:{height:3.5,width:2.4,length:9,weight:14}}}};
const r=await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson',{method:'POST',headers:{'content-type':'application/json',Authorization:key},signal:AbortSignal.timeout(25000),body:JSON.stringify(body)});
const j=await r.json();
console.log('status',r.status,j.error?JSON.stringify(j.error):'');
for(const [i,f] of (j.features||[]).entries()){
 console.log(`\nroute ${i+1}: ${(f.properties.summary.distance/1000).toFixed(1)} km`);
 for(const [name,info] of Object.entries(f.properties.extras||{}))console.log(`  ${name}: summary`,JSON.stringify(info.summary.map(s=>({value:s.value,km:+(s.distance/1000).toFixed(2),pct:s.amount}))));
}
