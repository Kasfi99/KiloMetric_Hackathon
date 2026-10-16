// Live preview for every demo order (ORS + Gemini), as the driver app would request it.
// Run: node --env-file=.env scripts/verify-demo-routes.mjs
import {seed,demoOrders} from '../lib/seed.js';
import {demoUsers} from '../lib/auth.js';
import {previewRoutes} from '../lib/routing.js';
const orsKey=process.env.ORS_API_KEY,apiKey=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL||'gemini-3.8-flash';
if(!orsKey){console.error('Set ORS_API_KEY');process.exit(1);}
const db=seed(),orders=demoOrders(demoUsers(db.trucks));
// ORIGIN="lat,lng" overrides the default Jakarta Selatan origin (e.g. to reproduce a driver's report).
const [lat,lng]=(process.env.ORIGIN||'-6.2297,106.8295').split(',').map(Number);
const origin={latitude:lat,longitude:lng,accuracy:8,timestamp:Date.now()};
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:8000,hazmat:'none',grossKg:16000};
for(const o of orders){
 const stops=[{address:o.pickupAddress},...o.stops.map(s=>({address:s.address}))];
 const t0=Date.now(),r=await previewRoutes({origin,specs,stops},{orsKey,gemini:apiKey?{apiKey,model}:null});
 console.log(`\n${o.reference}: HTTP ${r.status} in ${Date.now()-t0} ms, provider ${r.body.routing?.provider}, AI ${r.body.explanation?.status} (${model})`);
 if(r.status!==200){console.log(' ',r.body.error);continue;}
 for(const s of r.body.stops)console.log(`  stop ${s.address} → ${s.geocodeLabel} [${s.geocodePrecision}]`);
 for(const x of r.body.routes)console.log(`  ${x.id} rank ${x.rank}: ${x.distanceKm} km, ${x.durationMin} min${x.recommended?' ★AI':''}`);
 console.log('  warnings:',[...new Set(r.body.routes.flatMap(x=>x.warnings))].join(' / ')||'-');
 console.log('  AI:',r.body.explanation.summary);
}
