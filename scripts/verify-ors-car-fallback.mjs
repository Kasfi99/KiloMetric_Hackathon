// Live check that the driving-car profile works with this key (used when the driver's position has no truck road).
// Run: node --env-file=.env scripts/verify-ors-car-fallback.mjs
import {orsRoutes} from '../lib/routing.js';
const apiKey=process.env.ORS_API_KEY;if(!apiKey){console.error('Set ORS_API_KEY');process.exit(1);}
const origin={latitude:-6.1530,longitude:106.7870},stops=[{address:'Pulogadung',latitude:-6.19,longitude:106.9}];
const specs={heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,loadKg:6000,hazmat:'none',grossKg:14000};
for(const profile of ['driving-hgv','driving-car']){
 const r=await orsRoutes({origin,stops,specs},{apiKey,alternatives:false,profile,lang:'en'});
 console.log(profile.padEnd(12),r.routes.map(x=>`${x.distanceKm} km / ${x.durationMin} min · checked [${x.restrictions.checked}]`).join(' | '));
}
