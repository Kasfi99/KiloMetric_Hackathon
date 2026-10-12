export function analytics(db) {
  const trucks = db.trucks.map(t => {
    const records = db.maintenance.filter(m => m.truckId === t.id);
    const spend = records.reduce((sum, m) => sum + eventCost(m), 0);
    const distance = t.odometer - t.baselineOdometer;
    return { ...t, spend, distance, cpk: distance > 0 ? spend / distance : null, visits: records.length };
  });
  const cycles = [];
  for (const truck of db.trucks) {
    const installed = new Map();
    const events = db.maintenance.filter(m => m.truckId === truck.id).sort((a,b) => a.date.localeCompare(b.date) || a.odometer-b.odometer || a.id.localeCompare(b.id));
    for (const event of events) for (const item of event.items) {
      const part = db.parts.find(p => p.id === item.partId);
      const position = item.position.trim().toLowerCase();
      const slot = `${part.category}:${position}`;
      const previous = installed.get(slot);
      if (previous) {
        const distance = event.odometer - previous.odometer;
        cycles.push({ ...previous, endDate: event.date, endOdometer:event.odometer, replacementPartId:part.id, distance, status: 'completed', cpk: distance > 0 ? previous.cost / distance : null, unitCpk:distance > 0 ? previous.cost / (previous.quantity * distance) : null });
      }
      installed.set(slot, { installationId:event.id+':'+slot,quantity:item.quantity,truckId: truck.id, model: truck.model, duty: truck.duty, partId: part.id, brand: part.brand, name: part.name, category: part.category, position, odometer: event.odometer, startDate: event.date, cost: item.quantity * item.unitCost + item.labor });
    }
    for (const cycle of installed.values()) cycles.push({ ...cycle, distance: truck.odometer-cycle.odometer, status: 'active', cpk: null, unitCpk:null });
  }
  const groups = new Map();
  for (const c of cycles.filter(c => c.status === 'completed' && c.distance > 0)) {
    const key = `${c.model}|${c.duty}|${c.category}|${c.partId}|${c.position}`;
    const g = groups.get(key) || { model:c.model, duty:c.duty, category:c.category, partId:c.partId, brand:c.brand, name:c.name, position:c.position, cost:0, distance:0, samples:0 };
    g.cost += c.cost; g.distance += c.distance; g.samples++; groups.set(key,g);
  }
  const comparisons = [...groups.values()].map(g => ({ ...g, cpk:g.cost/g.distance, avgLife:g.distance/g.samples })).sort((a,b)=>a.cpk-b.cpk);
  const totalSpend = trucks.reduce((s,t)=>s+t.spend,0);
  const totalDistance = trucks.reduce((s,t)=>s+t.distance,0);
  return { trucks, cycles, comparisons, totalSpend, totalDistance, fleetCpk:totalDistance>0?totalSpend/totalDistance:null, completedCycles:cycles.filter(c=>c.status==='completed'&&c.distance>0).length };
}
export function summarizePartCycles(cycles,partId,model='') {
  const matching=cycles.filter(c=>c.partId===partId&&(!model||c.model===model));
  const completed=matching.filter(c=>c.status==='completed'&&c.distance>0);
  const cost=completed.reduce((s,c)=>s+c.cost,0);
  const unitDistance=completed.reduce((s,c)=>s+c.distance*c.quantity,0);
  const units=completed.reduce((s,c)=>s+c.quantity,0);
  return {cpk:unitDistance>0?cost/unitDistance:null,avgLife:units>0?unitDistance/units:null,completed:completed.length,units,active:matching.filter(c=>c.status==='active').reduce((s,c)=>s+c.quantity,0),cycles:matching};
}
export function eventCost(event) {
  return event.items.reduce((s,i)=>s+i.quantity*i.unitCost+i.labor,0)+event.labor+event.otherCost;
}
