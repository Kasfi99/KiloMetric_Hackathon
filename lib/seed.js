export function seed() {
  const parts = [
    {id:'p1',name:'R156 Commercial Tire',brand:'Bridgestone',category:'Tires',sku:'BS-R156',models:['Hino 500','Isuzu Giga'],price:4250000},
    {id:'p2',name:'X Multi Z Tire',brand:'Michelin',category:'Tires',sku:'MI-XMZ',models:['Hino 500','Isuzu Giga'],price:5100000},
    {id:'p3',name:'Commercial Brake Lining',brand:'Bendix',category:'Brakes',sku:'BX-CBL',models:['Hino 500','Isuzu Giga'],price:1350000},
    {id:'p4',name:'OEM Brake Lining',brand:'Hino Genuine',category:'Brakes',sku:'HN-BL',models:['Hino 500'],price:1850000},
    {id:'p5',name:'Heavy Duty Oil Filter',brand:'Sakura',category:'Filters',sku:'SA-OF',models:['Hino 500','Isuzu Giga'],price:285000},
    {id:'p6',name:'Fleetguard Oil Filter',brand:'Fleetguard',category:'Filters',sku:'FG-OF',models:['Hino 500','Isuzu Giga'],price:390000}
  ];
  const trucks = [
    {id:'t1',plate:'B 9412 UXX',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:100000,odometer:178000},
    {id:'t2',plate:'B 9238 UXX',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:80000,odometer:158000},
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
