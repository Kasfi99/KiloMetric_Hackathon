// Live check of the driver-facing route explanation (ORS + Gemini) for a multi-stop and a single-stop demo order.
// Run: node --env-file=.env scripts/verify-route-explanation.mjs
import {previewRoutes} from '../lib/routing.js';
const gemini={apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_ROUTE_MODEL||process.env.GEMINI_MODEL};
if(!gemini.apiKey||!process.env.ORS_API_KEY){console.error('Set GEMINI_API_KEY and ORS_API_KEY');process.exit(1);}
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:6000,hazmat:'none',grossKg:14000};
const origin={latitude:-6.2297,longitude:106.8295,accuracy:8,timestamp:Date.now()};
const cases={
 'multi-stop (DO-DEMO-003)':['Kawasan Berikat Nusantara, Cakung','Pasar Induk Kramat Jati, Jakarta Timur','Jakarta International Container Terminal, Tanjung Priok'],
 'single stop (DO-DEMO-001)':['Kawasan Industri Pulogadung, Jakarta Timur','Jakarta International Container Terminal, Tanjung Priok'],
};
for(const [name,stops] of Object.entries(cases)){
 const t0=Date.now(),r=await previewRoutes({origin,specs,stops:stops.map(address=>({address})),lang:'en'},{orsKey:process.env.ORS_API_KEY,gemini,cpk:357,fuel:{efficiencyKmPerLiter:4,priceIdrPerLiter:6800},roughRoadFactor:null});
 const x=r.body.explanation;
 console.log(`\n== ${name}: HTTP ${r.status}, ${r.body.routes?.length} route(s), basis ${r.body.recommendation?.basis}, AI ${x?.status}, ${Date.now()-t0} ms`);
 console.log('summary:',x?.summary);
 for(const p of x?.perRoute??[])console.log(` ${p.routeId}: ${p.headline}\n   + ${p.pros.join('\n   + ')}\n   - ${p.cons.join('\n   - ')}`);
 console.log('caveats:',JSON.stringify(x?.caveats));
}
