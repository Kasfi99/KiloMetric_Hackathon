// Measures how long GEMINI_MODEL takes to answer the route-explanation request, without the server's 20 s timeout.
// Run: node --env-file=.env scripts/verify-gemini-latency.mjs   (RUNS=2 by default)
import {explainRoutes} from '../lib/route-explainer.js';
const apiKey=process.env.GEMINI_API_KEY,model=process.env.GEMINI_MODEL||'gemini-3.8-flash';
if(!apiKey){console.error('Set GEMINI_API_KEY');process.exit(1);}
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:6000,hazmat:'none',grossKg:14000};
const restrictions={checked:['height','width','length','weight'],unknown:['axleload','hazmat','bridge_limits','truck_bans','time_restrictions']};
const candidates=[{id:'ors-1',rank:1,distanceKm:42,durationMin:40,ascendM:300,descendM:290,tollIdr:null,restrictions,warnings:[]},{id:'ors-2',rank:2,distanceKm:41.5,durationMin:41,ascendM:280,descendM:275,tollIdr:null,restrictions,warnings:[]}];
// Strip the abort signal so we see the real latency; report thinking tokens if the API returns usage metadata.
const fetcher=async(url,options)=>{const t0=Date.now();const res=await fetch(url,{...options,signal:undefined});const body=await res.clone().json().catch(()=>({}));console.log(`  HTTP ${res.status} after ${((Date.now()-t0)/1000).toFixed(1)} s, usage ${JSON.stringify(body.usageMetadata||{})}`);return res;};
for(let i=0;i<Number(process.env.RUNS||2);i++){const r=await explainRoutes({candidates,specs,stops:[{address:'JICT'}],lang:'en'},{apiKey,model,fetcher,cache:new Map()});console.log(`run ${i+1} (${model}): ${r.status} — ${r.summary.slice(0,120)}`);}
