import test from 'node:test';
import assert from 'node:assert/strict';
import {tourSteps,pagesFor,tourKey} from '../src/tour-steps.js';

test('each role gets welcome, its own pages in nav order, then replay', ()=>{
 const counts={admin:11,manager:9,workshop:5,driver:3};
 for(const [role,n] of Object.entries(counts)){
  const steps=tourSteps(role),pages=steps.map(s=>s.page).filter(Boolean);
  assert.equal(steps.length,n,role);
  assert.equal(steps[0].target,null);
  assert.equal(steps.at(-1).target,'tour-replay');
  assert.deepEqual(pages,pagesFor(role),role);
 }
});

test('manager, workshop and driver never see admin-only pages', ()=>{
 for(const role of ['manager','workshop','driver'])for(const s of tourSteps(role))assert.ok(!['orders','users'].includes(s.page),role);
});

test('copy has no digits that could read as example figures, except the 1.2× flag rule', ()=>{
 for(const role of ['admin','driver'])for(const s of tourSteps(role))assert.doesNotMatch(s.body.replace('1.2×',''),/\d/,s.title);
});

test('unknown role falls back to admin pages; seen key is versioned per role', ()=>{
 assert.deepEqual(pagesFor('nope'),pagesFor('admin'));
 assert.match(tourKey('admin'),/^km\.tour\.v\d+\.admin$/);
});
