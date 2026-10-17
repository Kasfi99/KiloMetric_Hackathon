import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleGeocode,googleRouteTolls} from '../lib/google-maps.js';
import {routeCosts} from '../lib/routing.js';

const reply=(data,ok=true,status=ok?200:500)=>({ok,status,json:async()=>data});
const origin={latitude:-6.23,longitude:106.83};

test('googleGeocode: Places text search with an origin bias; coarse places stay approximate',async()=>{
 const calls=[];
 const places={
  'JICT':{displayName:{text:'PT. Jakarta International Container Terminal Office'},shortFormattedAddress:'Jl. Raya Sulawesi No.1, Jakarta Utara',formattedAddress:'Jl. Raya Sulawesi No.1, RT.7/RW.1, Ujung, Kec. Tj. Priok, Jkt Utara, Daerah Khusus Ibukota Jakarta 14310',location:{latitude:-6.1065,longitude:106.8939},primaryType:'service',types:['corporate_office','point_of_interest']},
  // Observed live: "Pelabuhan Tanjung Priok" resolved to a natural_feature point.
  'Pelabuhan Tanjung Priok':{displayName:{text:'Tandjungperiuk'},formattedAddress:'Tandjungperiuk',location:{latitude:-6.0919,longitude:106.8817},primaryType:'natural_feature',types:['natural_feature','establishment']},
 };
 const stops=await googleGeocode(['JICT','Pelabuhan Tanjung Priok','Nowhere'],origin,{apiKey:'k',fetcher:async(url,o)=>{const b=JSON.parse(o.body);calls.push({url,b,mask:o.headers['X-Goog-FieldMask'],key:o.headers['X-Goog-Api-Key']});return reply({places:places[b.textQuery]?[places[b.textQuery]]:[]});}});
 assert.equal(calls[0].url,'https://places.googleapis.com/v1/places:searchText');assert.equal(calls[0].key,'k');
 assert.equal(calls[0].b.regionCode,'ID');assert.deepEqual(calls[0].b.locationBias.circle.center,{latitude:-6.23,longitude:106.83});assert.match(calls[0].mask,/places.location/);
 assert.deepEqual(stops[0],{address:'JICT',latitude:-6.1065,longitude:106.8939,geocodeConfidence:null,geocodeLabel:'PT. Jakarta International Container Terminal Office, Jl. Raya Sulawesi No.1, Jakarta Utara',geocodePrecision:'exact',geocodeLayer:'service',geocodeSource:'google'});
 assert.equal(stops[1].geocodePrecision,'approximate');assert.equal(stops[1].geocodeLabel,'Tandjungperiuk','label is not repeated');
 assert.equal(stops[2].latitude,null);assert.equal(stops[2].geocodeSource,'google');
 await assert.rejects(googleGeocode(['JICT'],origin,{apiKey:'k',fetcher:async()=>reply({error:{message:'API not enabled'}},false,403)}),/Google Places returned HTTP 403/);
});

test('googleRouteTolls: Google follows each ORS route through via points; toll and traffic only when the distance matches',async()=>{
 const line=Array.from({length:50},(_,i)=>[-6.19+i*0.0017,106.917-i*0.0005]);
 const routes=[{id:'ors-1',distanceKm:16.2,polyline:line},{id:'ors-2',distanceKm:12.5,polyline:line},{id:'ors-3',distanceKm:20,polyline:line},{id:'ors-4',distanceKm:18,polyline:line}];
 const answers={
  'ors-1':{routes:[{distanceMeters:16100,duration:'1500s',travelAdvisory:{tollInfo:{estimatedPrice:[{currencyCode:'IDR',units:'17000'}]}}}]},
  // Observed live: Google detoured 12.5 km → 21.4 km; its toll is not this route's toll.
  'ors-2':{routes:[{distanceMeters:21400,duration:'3143s',travelAdvisory:{tollInfo:{estimatedPrice:[{currencyCode:'IDR',units:'11000'}]}}}]},
  'ors-3':{routes:[{distanceMeters:20300,duration:'1800s'}]},
  'ors-4':{routes:[{distanceMeters:18000,duration:'1200s',travelAdvisory:{tollInfo:{}}}]},
 };
 const bodies=[];let i=0;const order=['ors-1','ors-2','ors-3','ors-4'];
 const out=await googleRouteTolls(routes,{apiKey:'k',fetcher:async(url,o)=>{const b=JSON.parse(o.body);bodies.push(b);return reply(answers[order[i++]]);}});
 assert.deepEqual(out,[{tollIdr:17000,trafficDurationMin:25},{tollIdr:null,trafficDurationMin:null},{tollIdr:0,trafficDurationMin:30},{tollIdr:null,trafficDurationMin:20}]);
 const b=bodies[0];
 assert.deepEqual(b.routeModifiers,{vehicleInfo:{emissionType:'DIESEL'},tollPasses:['ID_E_TOLL']});assert.deepEqual(b.extraComputations,['TOLLS']);assert.equal(b.routingPreference,'TRAFFIC_AWARE');
 assert.ok(b.intermediates.length>0&&b.intermediates.length<=25&&b.intermediates.every(p=>p.via===true),'Routes API allows at most 25 intermediates');
 assert.deepEqual(b.origin.location.latLng,{latitude:line[0][0],longitude:line[0][1]});
 const failed=await googleRouteTolls(routes.slice(0,1),{apiKey:'k',fetcher:async()=>{throw new Error('offline');}});
 assert.deepEqual(failed,[{tollIdr:null,trafficDurationMin:null}],'Google failure never blocks the preview');
});

test('routeCosts: toll joins the total only when every route has a known toll',()=>{
 const base={durationMin:40,roadCondition:null};
 const fuel={efficiencyKmPerLiter:4,priceIdrPerLiter:6800};
 const known=routeCosts([{...base,id:'a',distanceKm:40,tollIdr:17000},{...base,id:'b',distanceKm:42,tollIdr:0,durationMin:45}],{cpk:400,fuel});
 assert.deepEqual([known.routes[0].cost.tollCost,known.routes[0].cost.tollIncluded,known.routes[0].cost.totalCost],[17000,true,16000+68000+17000]);
 assert.deepEqual([known.recommendedId,known.basis],['b','cost'],'a toll-free route can win on total cost');
 const mixed=routeCosts([{...base,id:'a',distanceKm:40,tollIdr:17000},{...base,id:'b',distanceKm:42,tollIdr:null}],{cpk:400,fuel});
 assert.deepEqual([mixed.routes[0].cost.tollCost,mixed.routes[0].cost.tollIncluded,mixed.routes[0].cost.totalCost],[17000,false,16000+68000],'one unknown toll keeps tolls out of every total');
});
