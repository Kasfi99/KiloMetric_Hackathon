// Probe for H2 (Gemini structured route explanation) plus a live end-to-end previewRoutes run (ORS + Gemini).
// Run: node --env-file=.env scripts/verify-gemini-explainer.mjs   (RUNS=5 by default)
import {explainRoutes} from '../lib/route-explainer.js';
import {previewRoutes} from '../lib/routing.js';
const apiKey=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL||'gemini-3.8-flash';
if(!apiKey){console.error('Set GEMINI_API_KEY');process.exit(1);}
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:8000,hazmat:'none',grossKg:16000};
const restrictions={checked:['height','width','length','weight'],unknown:['axleload','hazmat','bridge_limits','truck_bans','time_restrictions']};
const candidates=[{id:'ors-1',rank:1,distanceKm:41.9,durationMin:42,ascendM:273,descendM:272,tollIdr:null,restrictions,warnings:[]},{id:'ors-2',rank:2,distanceKm:46.7,durationMin:54,ascendM:316,descendM:315,tollIdr:null,restrictions,warnings:[]}];
let ok=0;const runs=Number(process.env.RUNS||5);
for(let i=0;i<runs;i++){const r=await explainRoutes({candidates,specs,stops:[{address:'Cikarang, Bekasi'}]},{apiKey,model});console.log(`H2 run ${i+1}:`,r.status,r.recommendedRouteId,'|',r.summary,'| caveats:',r.caveats.length);if(r.status==='ok')ok++;}
console.log(`H2: ${ok}/${runs} ok (model ${model})`);
if(!process.env.ORS_API_KEY)process.exit(0);
const origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};
for(const stops of [[{address:'Cikarang, Bekasi'}],[{address:'Kawasan Industri Pulogadung, Jakarta Timur'}],[{address:'Jl. Asia Afrika No. 8, Bandung'}]]){
 const t0=Date.now(),r=await previewRoutes({origin,specs,stops},{orsKey:process.env.ORS_API_KEY,gemini:{apiKey,model}});
 console.log(`\nE2E ${stops[0].address}: HTTP ${r.status} in ${Date.now()-t0} ms, provider ${r.body.routing?.provider}, explanation ${r.body.explanation?.status}`);
 if(r.status!==200){console.log(' ',r.body.error);continue;}
 console.log('  stop:',r.body.stops.map(s=>`${s.geocodeLabel} [${s.geocodePrecision}/${s.geocodeLayer}]`).join(' | '));
 for(const x of r.body.routes)console.log(`  ${x.id} rank ${x.rank}: ${x.distanceKm} km, ${x.durationMin} min, ↑${x.ascendM} ↓${x.descendM}${x.recommended?' ★AI':''} | warnings: ${x.warnings.join(' / ')||'-'}`);
 console.log('  AI summary:',r.body.explanation.summary);
}
