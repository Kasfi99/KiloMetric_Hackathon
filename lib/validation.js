import {masterSpecifications} from './trips.js';
export function validate(db) {
  const fail = message => { throw new Error(message); };
  const str = (v,label,max=160) => { if(typeof v !== 'string'||!v.trim()||v.length>max) fail(`${label} is required (maximum ${max} characters).`); };
  const num = (v,label,min=0) => { if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>1e12) fail(`${label} must be a valid number of at least ${min}.`); };
  const date = v => { if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v) fail('Use a valid date.'); if(v>new Date().toISOString().slice(0,10)) fail('Maintenance and tracking dates cannot be in the future.'); };
  const unique = arr => new Set(arr).size===arr.length;
  if(!unique(db.trucks.map(t=>t.plate.trim().toUpperCase()))) fail('A truck with this license plate already exists.');
  if(!unique(db.parts.map(p=>p.sku.trim().toUpperCase()))) fail('A part with this SKU already exists.');
  for(const t of db.trucks) {
    str(t.plate,'License plate'); str(t.model,'Truck model'); str(t.duty,'Operating profile'); date(t.baselineDate);
    num(t.baselineOdometer,'Tracking start odometer'); num(t.odometer,'Current odometer',t.baselineOdometer);
    if(t.specifications!==undefined&&t.specifications!==null) masterSpecifications(t.specifications);
    if(t.specReports!==undefined&&(!Array.isArray(t.specReports)||t.specReports.some(r=>typeof r?.id!=='string'||typeof r.driverId!=='string'||typeof r.note!=='string'||r.note.length>300||Number.isNaN(Date.parse(r.at))))) fail('Truck specification reports are invalid.');
  }
  for(const p of db.parts) {
    for(const key of ['name','brand','category','sku']) str(p[key],key);
    num(p.price,'Unit price',0.01);
    if(!Array.isArray(p.models)||!p.models.length) fail('At least one compatible truck model is required.');
    for(const m of p.models) str(m,'Compatible model');
  }
  for(const m of db.maintenance) {
    const truck=db.trucks.find(t=>t.id===m.truckId);
    if(!truck) fail('Choose an existing truck.'); date(m.date);
    if(m.date<truck.baselineDate) fail('Maintenance cannot precede the tracking start date.');
    num(m.odometer,'Service odometer',truck.baselineOdometer);
    if(m.odometer>truck.odometer) fail('Current odometer cannot be lower than a recorded workshop reading. Correct the maintenance record first.');
    str(m.workshop,'Workshop');
    if(typeof m.notes!=='string'||m.notes.length>2000) fail('Notes must be under 2,000 characters.');
    num(m.labor,'General labor'); num(m.otherCost,'Other maintenance costs');
    if(!Array.isArray(m.items)||m.items.length>40) fail('A service can contain at most 40 part lines.');
    const slots=[];
    for(const i of m.items) {
      const p=db.parts.find(p=>p.id===i.partId); if(!p) fail('Choose an existing spare part.');
      if(!p.models.includes(truck.model)) fail(`${p.name} is not marked compatible with ${truck.model}.`);
      str(i.position,'Installed position');
      num(i.quantity,'Quantity',1); if(!Number.isInteger(i.quantity)) fail('Quantity must be a whole number.');
      num(i.unitCost,'Actual unit price',0.01); num(i.labor,'Part installation labor');
      slots.push(`${p.category}:${i.position.trim().toLowerCase()}`);
    }
    if(!unique(slots)) fail('Each category and installation position can appear only once per visit.');
  }
  for(const t of db.trucks) {
    const records=db.maintenance.filter(m=>m.truckId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.odometer-b.odometer);
    for(let i=1;i<records.length;i++) {
      if(records[i].odometer<records[i-1].odometer) fail('Odometer readings must increase with maintenance dates.');
      if(records[i].date===records[i-1].date&&records[i].odometer===records[i-1].odometer) fail('Combine maintenance at the same date and odometer into one visit.');
    }
  }
}
export function normalize(type, body, id) {
  const s=v=>typeof v==='string'?v.trim():'';
  const n=v=>v===''||v===null||v===undefined?NaN:Number(v);
  if(type==='trucks') return {id,plate:s(body.plate).toUpperCase(),model:s(body.model),duty:s(body.duty),baselineDate:s(body.baselineDate),baselineOdometer:n(body.baselineOdometer),odometer:n(body.odometer)};
  if(type==='parts') return {id,name:s(body.name),brand:s(body.brand),category:s(body.category),sku:s(body.sku).toUpperCase(),price:n(body.price),models:[...new Set((Array.isArray(body.models)?body.models:[]).map(s))]};
  return {id,truckId:s(body.truckId),date:s(body.date),odometer:n(body.odometer),workshop:s(body.workshop),notes:s(body.notes),labor:n(body.labor),otherCost:n(body.otherCost),items:(Array.isArray(body.items)?body.items:[]).map(i=>({partId:s(i.partId),position:s(i.position).toLowerCase(),quantity:n(i.quantity),unitCost:n(i.unitCost),labor:n(i.labor)}))};
}
