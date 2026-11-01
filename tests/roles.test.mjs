import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isStaff,roleLabel,canReadRecommendations} from '../src/roles.mjs';
import {countsFor} from '../supabase/functions/push-notifications/policy.mjs';
test('both split roles retain recommendations and expiry notifications within their store',()=>{
 for(const role of ['rtz','srtz','srtz_rtz']){
  assert.ok(isStaff(role));assert.ok(canReadRecommendations(role));
  assert.deepEqual(countsFor({role,store_id:'a'},[{id:'a',is_active:true},{id:'b',is_active:true}],[{store_id:'a',expiry_date:'2026-11-02'},{store_id:'b',expiry_date:'2026-11-01'}],'2026-11-01'),{expired:0,today:1});
 }
 assert.equal(roleLabel('rtz'),'РТЗ');assert.equal(roleLabel('srtz'),'СРТЗ');assert.equal(roleLabel('srtz_rtz'),'РТЗ');
 assert.equal(isStaff('manager'),false);assert.equal(isStaff('unknown'),false);
});
