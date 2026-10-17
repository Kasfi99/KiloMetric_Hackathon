import { randomUUID } from 'node:crypto';
import { newOrder } from './orders.js';

// Fictional delivery orders for the demo driver, so the mobile app has work on first launch.
// Addresses are places that ORS geocodes to the right venue (checked live with scripts/verify-demo-addresses.mjs);
// street addresses only resolve to a city centroid, and some named estates resolve to the wrong place.
export function demoOrders(users) {
  const admin = users.find(u => u.role === 'admin'), driver = users.find(u => u.role === 'driver');
  if (!admin || !driver || driver.assignedTruckIds.length < 2) return [];
  const [truckA, truckB] = driver.assignedTruckIds, now = new Date().toISOString();
  const inDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const assigned = (fields, truckId) => ({ ...newOrder(fields, randomUUID(), admin.id, { kind: 'demo_seed' }), status: 'assigned', driverId: driver.id, truckId, reviewedAt: now, reviewedBy: admin.id, version: 2, costInputs: { fuelEfficiencyKmPerLiter: 4, fuelPriceIdrPerLiter: 6800, tollOverrideIdr: null } });
  return [
    assigned({ reference: 'DO-DEMO-001', customer: 'PT Ekspor Nusantara (demo)', deliveryDate: inDays(1), pickupAddress: 'Kawasan Industri Pulogadung, Jakarta Timur', stops: [{ recipient: 'Depo ekspor (demo)', address: 'Jakarta International Container Terminal, Tanjung Priok', contact: '', notes: 'Serahkan ke petugas gate. Data demo.' }], items: [{ description: 'Karton suku cadang (demo)', quantity: 120, unit: 'karton' }], cargoWeightKg: 6000, notes: 'Order demo hackathon.' }, truckA),
    assigned({ reference: 'DO-DEMO-002', customer: 'PT Kargo Udara Sentosa (demo)', deliveryDate: inDays(1), pickupAddress: 'Kawasan Industri Pulogadung, Jakarta Timur', stops: [{ recipient: 'Gudang kargo bandara (demo)', address: 'Bandara Soekarno-Hatta, Tangerang', contact: '', notes: 'Data demo.' }], items: [{ description: 'Palet komponen elektronik (demo)', quantity: 8, unit: 'palet' }], cargoWeightKg: 8000, notes: 'Order demo hackathon.' }, truckB),
    assigned({ reference: 'DO-DEMO-003', customer: 'CV Distribusi Pangan (demo)', deliveryDate: inDays(2), pickupAddress: 'Kawasan Berikat Nusantara, Cakung', stops: [{ recipient: 'Kios grosir (demo)', address: 'Pasar Induk Kramat Jati, Jakarta Timur', contact: '', notes: 'Bongkar sebagian. Data demo.' }, { recipient: 'Depo ekspor (demo)', address: 'Jakarta International Container Terminal, Tanjung Priok', contact: '', notes: 'Sisa muatan. Data demo.' }], items: [{ description: 'Karung beras 50 kg (demo)', quantity: 90, unit: 'karung' }], cargoWeightKg: 4500, notes: 'Order demo multi-stop.' }, truckA),
  ];
}

export function seed() {
  const parts = [
    {id:'p1',name:'R156 Commercial Tire',brand:'Bridgestone',category:'Tires',sku:'BS-R156',models:ALL_MODELS,price:4250000},
    {id:'p2',name:'X Multi Z Tire',brand:'Michelin',category:'Tires',sku:'MI-XMZ',models:ALL_MODELS,price:5100000},
    {id:'p3',name:'Commercial Brake Lining',brand:'Bendix',category:'Brakes',sku:'BX-CBL',models:ALL_MODELS,price:1350000},
    {id:'p4',name:'OEM Brake Lining',brand:'Hino Genuine',category:'Brakes',sku:'HN-BL',models:['Hino 500'],price:1850000},
    {id:'p5',name:'Heavy Duty Oil Filter',brand:'Sakura',category:'Filters',sku:'SA-OF',models:ALL_MODELS,price:285000},
    {id:'p6',name:'Fleetguard Oil Filter',brand:'Fleetguard',category:'Filters',sku:'FG-OF',models:ALL_MODELS,price:390000},
    {id:'p7',name:'GT Radial Truck Tire',brand:'Gajah Tunggal',category:'Tires',sku:'GT-GTR',models:ALL_MODELS,price:3150000},
    {id:'p8',name:'OEM Brake Lining',brand:'Mitsubishi Genuine',category:'Brakes',sku:'MF-BL',models:['Mitsubishi Fuso'],price:1750000},
    {id:'p9',name:'Donaldson Oil Filter',brand:'Donaldson',category:'Filters',sku:'DN-OF',models:ALL_MODELS,price:340000},
    {id:'p10',name:'Heavy Duty Air Filter',brand:'Sakura',category:'Air filters',sku:'SA-AF',models:ALL_MODELS,price:420000},
    {id:'p11',name:'Donaldson Air Filter',brand:'Donaldson',category:'Air filters',sku:'DN-AF',models:ALL_MODELS,price:510000},
    {id:'p12',name:'OEM Brake Lining',brand:'Isuzu Genuine',category:'Brakes',sku:'IS-BL',models:['Isuzu Giga'],price:1700000}
  ].map(p=>({...p,models:[...p.models]}));
  // Sample master specs for the demo driver's trucks; the other trucks have none until admin or workshop sets them.
  const demoSpecs = {heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000};
  const trucks = [
    {id:'t1',plate:'B 9412 UXX',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:100000,odometer:178000,specifications:{...demoSpecs}},
    {id:'t2',plate:'B 9238 UXX',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:80000,odometer:158000,specifications:{...demoSpecs}},
    {id:'t3',plate:'B 9186 UXX',model:'Isuzu Giga',duty:'Long haul',baselineDate:'2025-01-01',baselineOdometer:140000,odometer:232000},
    {id:'t4',plate:'B 9584 UXX',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:50000,odometer:128000},
    {id:'t5',plate:'B 9063 UXX',model:'Isuzu Giga',duty:'Long haul',baselineDate:'2025-01-01',baselineOdometer:120000,odometer:208000},
    {id:'t6',plate:'B 9651 UXX',model:'Hino 500',duty:'Urban delivery',baselineDate:'2025-01-01',baselineOdometer:40000,odometer:82000}
  ];
  const maintenance=[];
  for(const [index,t] of trucks.entries()) {
    const tire=index%2?'p2':'p1', brake=t.model==='Hino 500'&&index%2?'p4':'p3', filter=index%2?'p6':'p5';
    const checkpoints=[0,20000,40000,...(t.odometer-t.baselineOdometer>=60000?[60000]:[]),...(t.odometer-t.baselineOdometer>=80000?[80000]:[])];
    for(const [j,km] of checkpoints.entries()) {
      const ids=j===0||j===3?[tire,brake,filter]:j===2?[brake,filter]:[filter];
      maintenance.push({id:`m${index}-${j}`,truckId:t.id,date:`2025-${String(1+j*2).padStart(2,'0')}-15`,odometer:t.baselineOdometer+km,workshop:'Central fleet workshop',notes:j===0?'Opening installation; all costs included from tracking start.':'Scheduled service and component replacement.',labor:450000,otherCost:650000,items:ids.map(id=>({partId:id,position:id===tire?'Front axle pair':id===brake?'Rear axle set':'Engine',quantity:id===tire?2:1,unitCost:parts.find(p=>p.id===id).price,labor:id===tire?250000:id===brake?180000:50000}))});
    }
  }
  // A wider fleet with ~21 months of history, so CPK rankings and brand comparisons have enough samples.
  for(const [index,{truck,profile}] of extraFleet().entries()) {
    trucks.push(truck);
    maintenance.push(...history(truck,profile,parts,rng(index+1)));
  }
  return {schemaVersion:1,revision:1,currency:'IDR',sampleData:true,trucks,parts,maintenance,ai:{status:'not_configured',text:'',revision:null,updatedAt:null}};
}

const ALL_MODELS=['Hino 500','Isuzu Giga','Mitsubishi Fuso'];
// Fixed end date keeps the seed identical on every run (and never in the future).
const HISTORY_END='2026-10-10';
// Typical life per part before replacement, in km. Fictional, tuned so cheap parts are not always cheaper per km.
const LIFE_KM={p1:62000,p2:85000,p7:42000,p3:34000,p4:50000,p8:46000,p12:48000,p5:10000,p6:15000,p9:12500,p10:30000,p11:45000};
// Operating profile changes wear: stop-and-go wears brakes, construction sites wear tires and air filters.
const DUTY_WEAR={'Long haul':{Tires:1.15,Brakes:1.3},'Urban delivery':{Tires:0.85,Brakes:0.6},'Construction haul':{Tires:0.55,Brakes:0.75,'Air filters':0.6}};
const SLOT={Tires:{position:'Front axle pair',quantity:2,labor:250000},Brakes:{position:'Rear axle set',quantity:1,labor:180000},Filters:{position:'Engine',quantity:1,labor:50000},'Air filters':{position:'Engine air intake',quantity:1,labor:60000}};

// Small deterministic PRNG (mulberry32), so the seed and the tests that read it never change between runs.
function rng(seedNo){let a=seedNo>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;};}

function extraFleet(){
  const t=(id,plate,model,duty,baselineDate,baselineOdometer,specifications)=>({id,plate,model,duty,baselineDate,baselineOdometer,odometer:baselineOdometer,...(specifications?{specifications}:{})});
  const parts=(Tires,Brakes,Filters,air)=>({Tires,Brakes,Filters,'Air filters':air});
  const surabaya='Depo Surabaya workshop', bandung='Mitra workshop Bandung';
  return [
    {truck:t('t7','B 9707 UXX','Hino 500','Regional haul','2025-01-01',60000,{heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000}),profile:{kmPerMonth:7200,parts:parts('p2','p4','p6','p11')}},
    {truck:t('t8','B 9733 UXX','Hino 500','Regional haul','2025-01-01',95000),profile:{kmPerMonth:6800,parts:parts('p7','p3','p5','p10')}},
    {truck:t('t9','B 9815 UXX','Isuzu Giga','Construction haul','2025-01-01',150000),profile:{kmPerMonth:6000,wear:0.85,parts:parts('p7','p3','p5','p10'),issues:[
      {atKm:31450,notes:'Unscheduled repair: cracked rear leaf spring replaced after site work.',labor:1200000,otherCost:7800000},
      {atKm:78650,notes:'Brake lining damaged by site debris; replaced early.',labor:600000,otherCost:950000,replace:['Brakes']}]}},
    {truck:t('t10','B 9822 UXX','Isuzu Giga','Construction haul','2025-01-01',110000),profile:{kmPerMonth:5800,parts:parts('p1','p12','p9','p11')}},
    {truck:t('t11','L 9021 UB','Isuzu Giga','Long haul','2025-03-01',210000,{heightM:3.6,widthM:2.5,lengthM:11,axles:3,tareKg:9500,maxGrossKg:26000}),profile:{kmPerMonth:11000,workshop:surabaya,parts:parts('p2','p12','p6','p11')}},
    {truck:t('t12','B 9640 UXX','Hino 500','Urban delivery','2025-01-01',35000),profile:{kmPerMonth:3800,wear:0.7,parts:parts('p1','p3','p5','p10'),issues:[
      {atKm:22350,notes:'Harsh braking flagged by dispatcher; rear brake drums resurfaced.',labor:850000,otherCost:4500000,replace:['Brakes']}]}},
    {truck:t('t13','B 9671 UXX','Hino 500','Urban delivery','2025-02-01',52000),profile:{kmPerMonth:4100,parts:parts('p2','p4','p6','p11')}},
    {truck:t('t14','D 9340 AF','Mitsubishi Fuso','Regional haul','2025-01-01',70000,{heightM:3.4,widthM:2.45,lengthM:8.5,axles:2,tareKg:6500,maxGrossKg:16000}),profile:{kmPerMonth:6500,workshop:bandung,parts:parts('p1','p8','p9','p10')}},
    {truck:t('t15','D 9355 AF','Mitsubishi Fuso','Regional haul','2025-01-01',240000),profile:{kmPerMonth:6200,workshop:bandung,parts:parts('p7','p3','p5','p10'),issues:[
      {atKm:40250,notes:'Unscheduled repair: radiator and turbo hose replaced (ageing engine).',labor:1500000,otherCost:9200000},
      {atKm:96850,notes:'Clutch plate replaced.',labor:1300000,otherCost:6400000}]}},
    {truck:t('t16','B 9902 UXX','Mitsubishi Fuso','Urban delivery','2025-04-01',28000),profile:{kmPerMonth:3500,parts:parts('p2','p8','p6','p11')}},
    {truck:t('t17','L 9088 UB','Mitsubishi Fuso','Long haul','2025-06-01',130000),profile:{kmPerMonth:10500,workshop:surabaya,parts:parts('p1','p3','p9','p11')}},
    // Registered this month with no tracked distance yet: its CPK must show as unknown, not 0.
    {truck:t('t18','B 9950 UXX','Hino 500','Regional haul','2026-10-01',15000),profile:{history:false}}
  ];
}

// Simulates workshop visits: an opening installation, then a service at every oil filter change, where any part
// closer to wearing out than the next service is replaced too. Issue visits add unscheduled repairs.
function history(t,profile,parts,rand){
  if(profile.history===false) return [];
  const day=86400000, start=Date.parse(t.baselineDate), kmPerDay=profile.kmPerMonth/30.44;
  const totalKm=Math.round((Date.parse(HISTORY_END)-start)/day*kmPerDay/10)*10;
  t.odometer=t.baselineOdometer+totalKm;
  const dateAt=km=>new Date(start+Math.round(km/kmPerDay)*day).toISOString().slice(0,10);
  const part=id=>parts.find(p=>p.id===id), ids=Object.values(profile.parts), due={};
  const life=id=>LIFE_KM[id]*(DUTY_WEAR[t.duty]?.[part(id).category]??1)*(profile.wear??1)*(0.9+rand()*0.2);
  const install=(km,list)=>list.map(id=>{const p=part(id),s=SLOT[p.category];due[p.category]=km+life(id);return {partId:id,position:s.position,quantity:s.quantity,unitCost:Math.round(p.price*(0.94+rand()*0.1)/1000)*1000,labor:s.labor};});
  const visits=[];
  const visit=(km,items,extra={})=>visits.push({id:`${t.id}-v${visits.length}`,truckId:t.id,date:dateAt(km),odometer:t.baselineOdometer+km,workshop:profile.workshop??'Central fleet workshop',notes:extra.notes??'Scheduled service and component replacement.',labor:extra.labor??Math.round((350000+rand()*200000)/10000)*10000,otherCost:extra.otherCost??Math.round((300000+rand()*500000)/10000)*10000,items});
  visit(0,install(0,ids),{notes:'Opening installation; all costs included from tracking start.'});
  const issues=[...(profile.issues??[])];
  for(let km=Math.round(due.Filters/100)*100;km<=totalKm;km=Math.round(due.Filters/100)*100) {
    while(issues.length&&issues[0].atKm<km){const i=issues.shift();if(i.atKm<=totalKm)visit(i.atKm,install(i.atKm,ids.filter(id=>i.replace?.includes(part(id).category))),i);}
    const nextService=LIFE_KM[profile.parts.Filters]/2;
    visit(km,install(km,ids.filter(id=>due[part(id).category]<km+nextService)));
  }
  return visits;
}
