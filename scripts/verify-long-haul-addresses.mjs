// Live check of long-haul demo addresses with Google Places (primary) and ORS (fallback), as /api/routes/preview geocodes them.
// Run: node --env-file=.env scripts/verify-long-haul-addresses.mjs   (never commit its output)
import {googleGeocode} from '../lib/google-maps.js';
import {geocodeStops} from '../lib/routing.js';
import {haversine} from '../lib/trips.js';
const origin={latitude:-6.2297,longitude:106.8295};
const candidates=process.argv.slice(2).length?process.argv.slice(2):[
 'Kawasan Industri Jababeka, Cikarang','MM2100 Industrial Town, Cikarang Barat','Kawasan Industri Delta Silicon, Cikarang','Karawang International Industrial City, Karawang','Kawasan Industri Modern Cikande, Serang',
 'Pelabuhan Merak, Cilegon','Pelabuhan Cirebon, Cirebon','Pelabuhan Tanjung Emas, Semarang','Pelabuhan Tanjung Intan, Cilacap','Pasar Induk Giwangan, Yogyakarta',
 'Pelabuhan Tanjung Perak, Surabaya','Terminal Teluk Lamong, Surabaya','Kawasan Industri SIER Rungkut, Surabaya','Pelabuhan Ketapang, Banyuwangi'];
const show=(tag,s)=>console.log(`${tag}\t${s.geocodePrecision??'MISS'}\t${s.latitude==null?'-':haversine(origin,s).toFixed(0).padStart(4)+' km'}\t${s.address}  →  ${s.geocodeLabel??'-'}`);
if(process.env.MAPS_API_KEY){for(const s of await googleGeocode(candidates,origin,{apiKey:process.env.MAPS_API_KEY}))show('google',s);}else console.log('MAPS_API_KEY not set: skipping Google');
if(process.env.ORS_API_KEY){for(const s of await geocodeStops(candidates,origin,{apiKey:process.env.ORS_API_KEY}))show('ors',s);}else console.log('ORS_API_KEY not set: skipping ORS');
