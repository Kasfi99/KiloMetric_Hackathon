import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../lib/seed.js';
import {analytics,eventCost,summarizePartCycles} from '../lib/analytics.js';
import {validate,normalize} from '../lib/validation.js';

test('fleet CPK uses all maintenance spend over combined distance, not mean truck CPK',()=>{
 const db=seed();const a=analytics(db);
 assert.equal(a.totalSpend,db.maintenance.reduce((s,m)=>s+eventCost(m),0));
 assert.equal(a.fleetCpk,a.totalSpend/db.trucks.reduce((s,t)=>s+t.odometer-t.baselineOdometer,0));
 assert.notEqual(a.fleetCpk,a.trucks.reduce((s,t)=>s+t.cpk,0)/a.trucks.length);
});
test('part lifetime closes on replacement, with normalized position; current catalog prices do not alter history',()=>{
 const db=seed();const before=analytics(db);db.maintenance[0].items[0].position='FRONT AXLE PAIR';
 db.parts[0].price=99000000;const after=analytics(db);
 assert.equal(after.completedCycles,before.completedCycles);
 assert.equal(after.totalSpend,before.totalSpend);
 const cycle=after.cycles.find(c=>c.truckId==='t1'&&c.partId==='p1'&&c.status==='completed');
 assert.equal(cycle.distance,60000);assert.equal(cycle.cpk,(4250000*2+250000)/60000);
 assert.ok(after.cycles.filter(c=>c.status==='active').every(c=>c.cpk===null));
});
test('comparison groups keep truck models and operating profiles separate',()=>{
 const db=seed();const a=analytics(db);
 assert.ok(a.comparisons.some(c=>c.model==='Hino 500'&&c.duty==='Urban delivery'));
 assert.ok(a.comparisons.some(c=>c.model==='Isuzu Giga'&&c.duty==='Long haul'));
 assert.ok(a.comparisons.every(c=>c.cpk===c.cost/c.distance));
});
test('untracked distance produces unknown CPK rather than division by zero',()=>{
 const db=seed();db.maintenance=[];db.trucks.forEach(t=>t.odometer=t.baselineOdometer);
 assert.equal(analytics(db).fleetCpk,null);assert.ok(analytics(db).trucks.every(t=>t.cpk===null));
});
test('invalid mileage, dates, compatibility, and duplicate installations are rejected',()=>{
 const db=seed();validate(db);
 let d=structuredClone(db);d.trucks[0].odometer=0;assert.throws(()=>validate(d),/odometer/);
 d=structuredClone(db);d.maintenance[0].date='2025-02-30';assert.throws(()=>validate(d),/date/);
 d=structuredClone(db);d.maintenance[0].items.push({...d.maintenance[0].items[0]});assert.throws(()=>validate(d),/once/);
 d=structuredClone(db);d.parts[0].models=['Unknown truck'];assert.throws(()=>validate(d),/compatible/);
 d=structuredClone(db);d.maintenance[0].labor=NaN;assert.throws(()=>validate(d),/labor/);
});
test('blank numbers cannot silently become zero and earlier odometer history is checked',()=>{
 const d=seed();d.trucks.push(normalize('trucks',{plate:'X1',model:'Hino 500',duty:'Regional haul',baselineDate:'2025-01-01',baselineOdometer:'',odometer:100},'x'));
 assert.throws(()=>validate(d),/odometer/);
 const b=seed();b.maintenance[1].odometer=b.trucks[0].baselineOdometer+30000;b.maintenance[2].odometer=b.trucks[0].baselineOdometer+20000;
 assert.throws(()=>validate(b),/increase/);
});
test('catalog part CPK uses completed unit-kilometers and excludes active/zero-distance cycles',()=>{
 const cycles=[
  {partId:'p',model:'Hino',status:'completed',quantity:2,cost:8400000,distance:60000},
  {partId:'p',model:'Hino',status:'completed',quantity:1,cost:3000000,distance:30000},
  {partId:'p',model:'Hino',status:'active',quantity:1,cost:99999999,distance:1000},
  {partId:'p',model:'Other',status:'completed',quantity:1,cost:1000000,distance:10000},
  {partId:'p',model:'Hino',status:'completed',quantity:1,cost:5000000,distance:0}
 ];
 const s=summarizePartCycles(cycles,'p','Hino');
 assert.equal(s.cpk,11400000/150000);assert.equal(s.avgLife,50000);assert.equal(s.completed,2);assert.equal(s.units,3);assert.equal(s.active,1);
 assert.equal(summarizePartCycles(cycles,'unknown').cpk,null);
 assert.equal(summarizePartCycles(cycles,'p','Other').cpk,100);
});
test('replacing a single position with another brand closes only the old part at that position',()=>{
 const d=seed();d.trucks=[{...d.trucks[0],baselineOdometer:100000,odometer:160000}];
 const visit=(id,date,odometer,items)=>({id,date,odometer,truckId:'t1',labor:0,otherCost:0,items});
 const item=(partId,position)=>({partId,position,quantity:1,unitCost:4000000,labor:200000});
 d.maintenance=[visit('a','2025-01-01',100000,[item('p1','front-left'),item('p1','front-right')]),visit('b','2025-06-01',160000,[item('p2','front-left')])];
 const a=analytics(d),old=a.cycles.find(c=>c.partId==='p1'&&c.status==='completed');
 assert.equal(old.unitCpk,70);assert.equal(old.endOdometer,160000);assert.equal(old.replacementPartId,'p2');
 assert.ok(a.cycles.some(c=>c.partId==='p1'&&c.position==='front-right'&&c.status==='active'&&c.unitCpk===null));
 assert.ok(a.cycles.some(c=>c.partId==='p2'&&c.position==='front-left'&&c.status==='active'));
 assert.equal(summarizePartCycles(a.cycles,'p1').cpk,70);
});
