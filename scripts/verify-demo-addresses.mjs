// Check which demo order addresses geocode precisely with ORS (venue/street, not city centroid).
// Run: node --env-file=.env scripts/verify-demo-addresses.mjs
import {geocodeStops} from '../lib/routing.js';
import {haversine} from '../lib/trips.js';
const apiKey=process.env.ORS_API_KEY;if(!apiKey){console.error('Set ORS_API_KEY');process.exit(1);}
const origin={latitude:-6.2297,longitude:106.8295};
const candidates=['Kawasan Industri Pulogadung, Jakarta Timur','Kawasan Industri Jababeka, Cikarang','MM2100 Industrial Town, Cikarang Barat','Kawasan Berikat Nusantara, Cakung','Jakarta International Container Terminal, Tanjung Priok','Terminal Peti Kemas Koja, Jakarta Utara','Bandara Soekarno-Hatta, Tangerang','Kawasan Industri Delta Silicon, Cikarang','Kawasan Industri Modern Cikande, Serang','Kawasan Industri Cibitung, Bekasi','Pasar Induk Kramat Jati, Jakarta Timur','Kawasan Industri Pulo Gadung Blok J'];
const stops=await geocodeStops(candidates,origin,{apiKey});
for(const s of stops)console.log(`${s.geocodePrecision??'MISS'}\t${s.geocodeLayer}\t${s.latitude===null?'-':haversine(origin,s).toFixed(1)+' km'}\t${s.address}  →  ${s.geocodeLabel}`);
