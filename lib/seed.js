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
    {id:'p1',name:'R156 Commercial Tire',brand:'Bridgestone',category:'Tires',sku:'BS-R156',models:['Hino 500','Isuzu Giga'],price:4250000},
    {id:'p2',name:'X Multi Z Tire',brand:'Michelin',category:'Tires',sku:'MI-XMZ',models:['Hino 500','Isuzu Giga'],price:5100000},
    {id:'p3',name:'Commercial Brake Lining',brand:'Bendix',category:'Brakes',sku:'BX-CBL',models:['Hino 500','Isuzu Giga'],price:1350000},
    {id:'p4',name:'OEM Brake Lining',brand:'Hino Genuine',category:'Brakes',sku:'HN-BL',models:['Hino 500'],price:1850000},
    {id:'p5',name:'Heavy Duty Oil Filter',brand:'Sakura',category:'Filters',sku:'SA-OF',models:['Hino 500','Isuzu Giga'],price:285000},
    {id:'p6',name:'Fleetguard Oil Filter',brand:'Fleetguard',category:'Filters',sku:'FG-OF',models:['Hino 500','Isuzu Giga'],price:390000}
  ];
  // Sample declaration for the demo driver's trucks so pre-trip is prefilled; the driver still confirms it.
  const demoSpecs = {heightM:3.5,widthM:2.4,lengthM:9,axles:3,tareKg:8000,maxGrossKg:20000,hazmat:'none'};
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
  return {schemaVersion:1,revision:1,currency:'IDR',sampleData:true,trucks,parts,maintenance,ai:{status:'not_configured',text:'',revision:null,updatedAt:null}};
}
