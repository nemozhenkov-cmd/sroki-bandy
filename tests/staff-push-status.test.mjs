import test from 'node:test';import assert from 'node:assert/strict';import {staffPushStatus} from '../supabase/functions/push-notifications/staff-status.mjs';
test('manager sees only aggregate staff connection status in own store, including zero devices',()=>{
 const actor={id:'m',role:'manager',store_id:'a'};const users=[{id:'one',role:'rtz',store_id:'a'},{id:'two',role:'srtz',store_id:'a'},{id:'foreign',role:'rtz',store_id:'b'},{id:'admin',role:'admin',store_id:'a'}];
 const subscriptions=[{user_id:'one',endpoint:'private',keys:'secret'},{user_id:'one'},{user_id:'foreign'}];
 assert.deepEqual(staffPushStatus(actor,users,subscriptions),[{user_id:'one',enabled:true},{user_id:'two',enabled:false}]);
 assert.deepEqual(staffPushStatus(actor,users,[]),[{user_id:'one',enabled:false},{user_id:'two',enabled:false}]);
});
test('non-managers cannot inspect staff subscriptions',()=>{for(const role of ['rtz','srtz','admin','tm',undefined])assert.throws(()=>staffPushStatus({role,store_id:'a'},[],[]));assert.throws(()=>staffPushStatus({role:'manager'},[],[]))});
