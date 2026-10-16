// Hypothesis check: ORS driving-hgv returns 404 (code 2010) when an origin is not within 350 m of a truck-routable road,
// and a larger `radiuses` value fixes it. Run: node --env-file=.env scripts/verify-ors-snapping.mjs
const key=process.env.ORS_API_KEY;if(!key){console.error('Set ORS_API_KEY');process.exit(1);}
const pulogadung=[106.9,-6.19];
// Points around Jelambar / Grogol (residential lanes) plus a main-road control point.
const origins={control_main_road:[106.8295,-6.2297],jelambar_1:[106.7870,-6.1530],jelambar_2:[106.7845,-6.1555],jelambar_3:[106.7905,-6.1500],grogol_lane:[106.7925,-6.1610]};
const route=async(origin,radiuses)=>{const r=await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson',{method:'POST',headers:{'content-type':'application/json',Authorization:key},body:JSON.stringify({coordinates:[origin,pulogadung],instructions:false,...(radiuses?{radiuses}:{}),options:{vehicle_type:'hgv',profile_params:{restrictions:{height:3.5,width:2.4,length:9,weight:14}}}})});const j=await r.json();return `${r.status}${j.error?` code ${j.error.code}: ${j.error.message}`:` ${(j.features?.[0]?.properties?.summary?.distance/1000).toFixed(1)} km`}`;};
for(const [name,o] of Object.entries(origins)){console.log(name.padEnd(18),'default:',await route(o),'| radius 1000:',await route(o,[1000,1000]));}
