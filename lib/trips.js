import {isPermutation} from './stop-order.js';
const num=(value,name,min,max)=>{if(value===''||value===null||value===undefined||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(`${name} must be between ${min} and ${max}.`);return Number(value);};
const text=(value,name)=>{if(typeof value!=='string'||!value.trim()||value.length>300)throw new Error(`${name} is required (maximum 300 characters).`);return value.trim();};
export function locationPoint(value,{now=Date.now(),fresh=false}={}){
 const p={latitude:num(value?.latitude,'Latitude',-90,90),longitude:num(value?.longitude,'Longitude',-180,180),accuracy:num(value?.accuracy,'GPS accuracy in meters',0,100),timestamp:num(value?.timestamp,'GPS timestamp',0,now+15000)};
 if(fresh&&now-p.timestamp>120000)throw new Error('GPS location is stale. Capture your current location again.');
 return p;
}
// Truck master specifications, set by admin or workshop. null = not set yet.
export const SPEC_KEYS=['heightM','widthM','lengthM','axles','tareKg','maxGrossKg'];
export function masterSpecifications(value){
 if(value===null)return null;
 const specs={heightM:num(value?.heightM,'Vehicle height (m)',0.5,10),widthM:num(value?.widthM,'Vehicle width (m)',0.5,10),lengthM:num(value?.lengthM,'Vehicle length (m)',1,50),axles:num(value?.axles,'Axle count',2,20),tareKg:num(value?.tareKg,'Empty vehicle weight (kg)',500,200000),maxGrossKg:num(value?.maxGrossKg,'Maximum permitted gross weight (kg)',500,250000)};
 if(!Number.isInteger(specs.axles))throw new Error('Axle count must be a whole number.');
 if(specs.maxGrossKg<=specs.tareKg)throw new Error('Maximum permitted gross weight must be above the empty vehicle weight.');
 return specs;
}
// Before 17 Oct 2026 trips copied driver-typed specs (with load and hazmat) onto the truck; keep only valid master fields.
export function storedSpecifications(value){try{return value?masterSpecifications(value):null;}catch{return null;}}
// Trip specs: dimensions and weights from the truck master, only cargo and hazmat from the driver.
export function tripSpecifications(value,master){
 const loadKg=num(value?.loadKg,'Cargo weight (kg)',0,200000),hazmat=value?.hazmat;
 if(!['none','flammable','explosive','other'].includes(hazmat))throw new Error('Select a hazardous goods classification.');
 const m=master?masterSpecifications(master):null;
 const specs={...Object.fromEntries(SPEC_KEYS.map(k=>[k,m?m[k]:null])),loadKg,hazmat,grossKg:m?m.tareKg+loadKg:null};
 if(m&&specs.grossKg>m.maxGrossKg)throw new Error('The truck and declared load exceed its permitted gross weight.');
 return {specs,source:m?'truck':'missing'};
}
const strField=(v,name,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(`Route plan ${name} is required (maximum ${max} characters).`);return v.trim();};
const keyList=(v,name)=>{if(!Array.isArray(v)||v.length>20||v.some(k=>typeof k!=='string'||!/^[a-z_]{1,40}$/.test(k)))throw new Error(`Route plan restrictions.${name} must be a list of keys.`);return [...v];};
// Snapshot of the provider route the driver chose. Stored verbatim so the plan can be audited after provider data changes.
export function routePlanSnapshot(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='object')throw new Error('Route plan must be an object.');
 if(!['ors','google','fixture'].includes(value.provider))throw new Error('Route plan provider must be ors, google or fixture.');
 if(!Array.isArray(value.polyline)||value.polyline.length<2||value.polyline.length>5000||value.polyline.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>90||Math.abs(p[1])>180))throw new Error('Route plan polyline must be 2–5000 [lat, lng] pairs.');
 if(!value.restrictions||typeof value.restrictions!=='object')throw new Error('Route plan restrictions are required.');
 if(typeof value.chosenAt!=='string'||Number.isNaN(Date.parse(value.chosenAt)))throw new Error('Route plan chosenAt must be an ISO timestamp.');
 const explanation=value.explanation===null||value.explanation===undefined?null:{recommendedRouteId:value.explanation.recommendedRouteId===null?null:strField(value.explanation.recommendedRouteId,'explanation.recommendedRouteId',100),headline:strField(value.explanation.headline,'explanation.headline',200)};
 return {routeId:strField(value.routeId,'routeId',100),provider:value.provider,distanceKm:num(value.distanceKm,'Route plan distance (km)',0.1,1e5),durationMin:num(value.durationMin,'Route plan duration (min)',1,1e5),polyline:value.polyline.map(([lat,lng])=>[lat,lng]),restrictions:{checked:keyList(value.restrictions.checked,'checked'),unknown:keyList(value.restrictions.unknown,'unknown')},explanation,wasRecommended:value.wasRecommended===true,chosenAt:new Date(value.chosenAt).toISOString(),...(value.cost!=null?{cost:planCost(value.cost)}:{}),...(value.roadCondition!=null?{roadCondition:planRoad(value.roadCondition)}:{}),...(value.stops!=null?{stops:planStops(value.stops)}:{}),...(value.stopOrder!=null?{stopOrder:planStopOrder(value.stopOrder)}:{})};
}
// Visiting order the driver chose (pickup first for orders), and the entered stop indices behind it.
function planStops(v){
 if(!Array.isArray(v)||v.length<1||v.length>11)throw new Error('Route plan stops must list 1–11 stops.');
 return v.map(s=>({address:strField(s?.address,'stop address',300),latitude:num(s?.latitude,'Route plan stop latitude',-90,90),longitude:num(s?.longitude,'Route plan stop longitude',-180,180)}));
}
function planStopOrder(v){
 if(!Array.isArray(v)||v.length>10||!isPermutation(v,v.length))throw new Error('Route plan stop order must list every stop exactly once.');
 return [...v];
}
// Optional route estimate figures copied from the preview: known numbers or null, nothing else.
const money=(v,name)=>{if(v===null)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e12)throw new Error(`Route plan cost ${name} must be a non-negative number or null.`);return v;};
function planCost(c){
 if(typeof c!=='object')throw new Error('Route plan cost must be an object.');
 const factor=c.roughRoadFactor===null||c.roughRoadFactor===undefined?null:num(c.roughRoadFactor,'Route plan cost roughRoadFactor',1,3);
 return {maintenanceCost:money(c.maintenanceCost??null,'maintenanceCost'),fuelCost:money(c.fuelCost??null,'fuelCost'),tollCost:money(c.tollCost??null,'tollCost'),totalCost:money(c.totalCost??null,'totalCost'),tripCpk:money(c.tripCpk??null,'tripCpk'),tollIncluded:c.tollIncluded===true,roughRoadFactor:factor,factorApplied:c.factorApplied===true};
}
function planRoad(r){
 if(typeof r!=='object')throw new Error('Route plan road condition must be an object.');
 const km=k=>{const v=r[k]??0;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e5)throw new Error(`Route plan road condition ${k} must be a non-negative number.`);return v;};
 return {pavedKm:km('pavedKm'),roughKm:km('roughKm'),unknownKm:km('unknownKm'),steepKm:km('steepKm'),ferryKm:km('ferryKm')};
}
export function createTrip(input,user,db,id){
 const truck=db.trucks.find(t=>t.id===input.truckId);
 if(!truck||!user.assignedTruckIds.includes(truck.id))throw new Error('Select a truck assigned to your driver account.');
 if(db.trips.some(t=>t.status==='active'&&(t.driverId===user.id||t.truckId===truck.id)))throw new Error('This driver or truck already has an active trip.');
 if(input.specsConfirmed!==true)throw new Error('Confirm the truck specifications and load before departure.');
 if(input.externalRouteConfirmed!==true)throw new Error('Confirm that your dispatcher has approved the route externally. In-app route candidates are provider estimates, not approvals.');
 const plan=routePlanSnapshot(input.routePlan);
 const {specs,source}=tripSpecifications(input.specs,truck.specifications),origin=locationPoint(input.origin,{fresh:true});
 const startOdometer=num(input.startOdometer,'Departure odometer',truck.odometer,1e12);
 return {id,driverId:user.id,driverName:user.name,truckId:truck.id,plate:truck.plate,origin,destination:text(input.destination,'Destination'),specs,specsSource:source,startOdometer,startedAt:new Date().toISOString(),status:'active',routing:plan?{status:'planned',provider:plan.provider,priority:'fastest',tollsAllowed:true,terrainStatus:plan.provider==='ors'?'provider_elevation':'unavailable',externalRouteConfirmed:true,plan}:{status:'not_connected',priority:'fastest',tollsAllowed:true,terrainStatus:'unavailable',externalRouteConfirmed:true},points:[origin],gpsDistanceKm:0,maintenanceCpkAtStart:null};
}
export function haversine(a,b){const rad=x=>x*Math.PI/180,dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function addLocations(trip,values){
 if(!Array.isArray(values)||!values.length||values.length>50)throw new Error('Send between 1 and 50 GPS points.');
 let added=0;
 for(const value of values){const p=locationPoint(value);const last=trip.points.at(-1);
  if(p.timestamp<=last.timestamp)continue;
  if(p.timestamp<Date.parse(trip.startedAt)-120000)throw new Error('GPS point precedes this trip.');
  const km=haversine(last,p),seconds=(p.timestamp-last.timestamp)/1000;
  if(km/seconds*3600>160)throw new Error('GPS movement is implausible. Capture a fresh location.');
  // Do not add drift inside the combined reported accuracy circles.
  if(km*1000>Math.max(10,(last.accuracy+p.accuracy)/2))trip.gpsDistanceKm+=km;
  trip.points.push(p);added++;
 }
 if(trip.points.length>10000)trip.points=trip.points.slice(-10000);
 return added;
}
export function completeTrip(trip,input,truck){
 const endOdometer=num(input.endOdometer,'Arrival odometer',Math.max(trip.startOdometer,truck.odometer),1e12);
 return {...trip,status:'completed',endedAt:new Date().toISOString(),endOdometer,odometerDistanceKm:endOdometer-trip.startOdometer,estimatedMaintenanceCost:trip.maintenanceCpkAtStart===null?null:(endOdometer-trip.startOdometer)*trip.maintenanceCpkAtStart};
}
