// Probe for hypotheses H1 (ORS driving-hgv alternatives + truck restrictions) and H6 (Indonesian geocoding).
// Run: ORS_API_KEY=... node scripts/verify-ors.mjs   (or: node --env-file=.env scripts/verify-ors.mjs)
const key=process.env.ORS_API_KEY;if(!key){console.error('Set ORS_API_KEY');process.exit(1);}
const origin={latitude:-6.2297,longitude:106.8295}; // Jakarta Selatan
const addresses=['Jl. Asia Afrika No. 8, Bandung','Pelabuhan Tanjung Priok, Jakarta Utara'];
const geocode=async text=>{const u=new URL('https://api.openrouteservice.org/geocode/search');u.searchParams.set('api_key',key);u.searchParams.set('text',text);u.searchParams.set('boundary.country','ID');u.searchParams.set('size','1');u.searchParams.set('focus.point.lat',origin.latitude);u.searchParams.set('focus.point.lon',origin.longitude);const r=await fetch(u);const j=await r.json();const f=j.features?.[0];return {text,ok:r.ok,status:r.status,confidence:f?.properties?.confidence??null,label:f?.properties?.label??null,coords:f?.geometry?.coordinates??null};};
for(const a of addresses)console.log('H6 geocode',await geocode(a));
const dest=(await geocode(addresses[0])).coords;
if(!dest){console.error('H6 failed: no destination coordinates');process.exit(1);}
const body={coordinates:[[origin.longitude,origin.latitude],dest],alternative_routes:{target_count:3,share_factor:0.6,weight_factor:1.6},elevation:true,instructions:false,options:{vehicle_type:'hgv',profile_params:{restrictions:{height:3.5,width:2.4,length:9,weight:16,axleload:5.33}}}};
const r=await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson',{method:'POST',headers:{'content-type':'application/json',Authorization:key},body:JSON.stringify(body)});
const j=await r.json();
console.log('H1 status',r.status,'features',j.features?.length,j.error?JSON.stringify(j.error):'');
for(const f of j.features||[])console.log(' route',(f.properties.summary.distance/1000).toFixed(1),'km',(f.properties.summary.duration/60).toFixed(0),'min ascent',f.properties.ascent,'descent',f.properties.descent,'points',f.geometry.coordinates.length);
