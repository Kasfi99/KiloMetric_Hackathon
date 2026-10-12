const num=(value,name,min,max)=>{if(value===''||value===null||value===undefined||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new Error(`${name} must be between ${min} and ${max}.`);return Number(value);};
const text=(value,name)=>{if(typeof value!=='string'||!value.trim()||value.length>300)throw new Error(`${name} is required (maximum 300 characters).`);return value.trim();};
export function locationPoint(value,{now=Date.now(),fresh=false}={}){
 const p={latitude:num(value?.latitude,'Latitude',-90,90),longitude:num(value?.longitude,'Longitude',-180,180),accuracy:num(value?.accuracy,'GPS accuracy in meters',0,100),timestamp:num(value?.timestamp,'GPS timestamp',0,now+15000)};
 if(fresh&&now-p.timestamp>120000)throw new Error('GPS location is stale. Capture your current location again.');
 return p;
}
export function truckSpecifications(value){
 const specs={heightM:num(value?.heightM,'Vehicle height (m)',0.5,10),widthM:num(value?.widthM,'Vehicle width (m)',0.5,10),lengthM:num(value?.lengthM,'Vehicle length (m)',1,50),axles:num(value?.axles,'Axle count',2,20),tareKg:num(value?.tareKg,'Empty vehicle weight (kg)',500,200000),maxGrossKg:num(value?.maxGrossKg,'Maximum permitted gross weight (kg)',500,250000),loadKg:num(value?.loadKg,'Cargo weight (kg)',0,200000),hazmat:value?.hazmat};
 if(!Number.isInteger(specs.axles))throw new Error('Axle count must be a whole number.');
 if(!['none','flammable','explosive','other'].includes(specs.hazmat))throw new Error('Select a hazardous goods classification.');
 specs.grossKg=specs.tareKg+specs.loadKg;
 if(specs.grossKg>specs.maxGrossKg)throw new Error('The declared truck and load exceed its permitted gross weight.');
 return specs;
}
export function createTrip(input,user,db,id){
 const truck=db.trucks.find(t=>t.id===input.truckId);
 if(!truck||!user.assignedTruckIds.includes(truck.id))throw new Error('Select a truck assigned to your driver account.');
 if(db.trips.some(t=>t.status==='active'&&(t.driverId===user.id||t.truckId===truck.id)))throw new Error('This driver or truck already has an active trip.');
 if(input.specsConfirmed!==true)throw new Error('Confirm the truck specifications and load before departure.');
 if(input.externalRouteConfirmed!==true)throw new Error('Routing is not connected. Confirm that your dispatcher has approved the route externally.');
 const specs=truckSpecifications(input.specs),origin=locationPoint(input.origin,{fresh:true});
 const startOdometer=num(input.startOdometer,'Departure odometer',truck.odometer,1e12);
 return {id,driverId:user.id,driverName:user.name,truckId:truck.id,plate:truck.plate,origin,destination:text(input.destination,'Destination'),specs,startOdometer,startedAt:new Date().toISOString(),status:'active',routing:{status:'not_connected',priority:'fastest',tollsAllowed:true,terrainStatus:'unavailable',externalRouteConfirmed:true},points:[origin],gpsDistanceKm:0,maintenanceCpkAtStart:null};
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
