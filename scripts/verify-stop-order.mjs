// Live probe of lib/stop-order.js (Google route matrix + Gemini) on DO-DEMO-003. Never commit its output.
// Run: node --env-file=.env scripts/verify-stop-order.mjs   (RUNS=5 by default; NO_NOTES=1 checks the fastest case)
// Verified 17 Oct 2026: fastest is JICT first (about 53 vs 78 min); with the notes Gemini must keep Pasar Induk first.
import {suggestStopOrder} from '../lib/stop-order.js';
const maps=process.env.MAPS_API_KEY,apiKey=process.env.GEMINI_API_KEY,model=process.env.GEMINI_ROUTE_MODEL||process.env.GEMINI_MODEL;
if(!maps||!apiKey){console.error('Set MAPS_API_KEY and GEMINI_API_KEY');process.exit(1);}
const start={latitude:-6.1450765,longitude:106.9358472};
const stops=[
 {address:'Pasar Induk Kramat Jati, Jakarta Timur',latitude:-6.2954566,longitude:106.8701877,notes:process.env.NO_NOTES?'':'Bongkar sebagian. Data demo.'},
 {address:'Jakarta International Container Terminal, Tanjung Priok',latitude:-6.1065129,longitude:106.8939227,notes:process.env.NO_NOTES?'':'Sisa muatan. Data demo.'},
];
const runs=Number(process.env.RUNS||5),tally={};
for(let i=0;i<runs;i++){
 const t=Date.now(),s=await suggestStopOrder({stops,start,lang:'en'},{mapsKey:maps,gemini:{apiKey,model},cache:new Map()});
 const key=s?`${s.order.join('→')} ${s.basis}/${s.source}`:'null';tally[key]=(tally[key]||0)+1;
 console.log(`run ${i+1} (${Date.now()-t} ms): ${key} | ${s?.minutes?.asEntered} vs ${s?.minutes?.suggested} min | ${s?.reason}`);
}
console.log('tally:',tally);
