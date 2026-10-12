import { normalize } from './validation.js';
import { eventCost } from './analytics.js';

// Keep separately reported mileage apart from workshop readings so corrections
// to a service record do not leave an inflated current odometer behind.
export function rememberReportedMileage(db) {
  for (const truck of db.trucks) truck.reportedOdometer ??= truck.odometer;
}

export function previewWorkshopVisit(db, form, existingId) {
  if(form.odometer===''||!Number.isFinite(Number(form.odometer))) return null;
  const next=structuredClone(db);
  rememberReportedMileage(next);
  const isNew=form.truckId==='__new__';
  const truckId=isNew?'preview-truck':form.truckId;
  if(isNew) next.trucks.push({id:truckId,...form.newTruck,trackingMode:'workshop',reportedOdometer:0,baselineDate:form.date,baselineOdometer:Number(form.odometer),odometer:Number(form.odometer)});
  if(!next.trucks.some(t=>t.id===truckId))return null;
  next.maintenance=next.maintenance.filter(m=>m.id!==existingId);
  next.maintenance.push(normalize('maintenance',{...form,truckId},'preview-visit'));
  syncWorkshopMileage(next);
  const truck=next.trucks.find(t=>t.id===truckId);
  const spend=next.maintenance.filter(m=>m.truckId===truckId).reduce((s,m)=>s+eventCost(m),0);
  const distance=truck.odometer-truck.baselineOdometer;
  return {spend,distance,cpk:distance>0&&Number.isFinite(spend)?spend/distance:null,baseline:truck.baselineOdometer};
}

export function syncWorkshopMileage(db) {
  for (const truck of db.trucks) {
    const visits = db.maintenance.filter(m => m.truckId === truck.id)
      .sort((a,b) => a.date.localeCompare(b.date) || a.odometer-b.odometer);
    if (truck.trackingMode === 'workshop' && visits.length) {
      truck.baselineDate = visits[0].date;
      truck.baselineOdometer = visits[0].odometer;
    }
    truck.odometer = Math.max(truck.reportedOdometer ?? truck.odometer,
      truck.baselineOdometer, ...visits.map(m => m.odometer));
  }
}
