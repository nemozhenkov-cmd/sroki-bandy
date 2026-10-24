import test from 'node:test';
import assert from 'node:assert/strict';
import {validSubscription,countsFor,moscowDay,dispatchSlot} from '../supabase/functions/push-notifications/policy.mjs';
const subscription = endpoint=>({endpoint,keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}});
test('push only reaches known TLS providers; blocks SSRF, userinfo, lookalike hosts and invalid keys',()=>{
  for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.notify.windows.com']) assert.ok(validSubscription(subscription(`https://${host}/send/abc`)));
  for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://evilpush.apple.com/a','https://127.0.0.1/','https://fcm.googleapis.com:444/a','https://u:p@fcm.googleapis.com/a']) assert.ok(!validSubscription(subscription(url)),url);
  assert.ok(!validSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{p256dh:'a',auth:'b'}}));
});
test('uses Moscow date and morning time even across UTC date boundary',()=>{
  assert.equal(moscowDay(new Date('2026-10-24T22:00:00Z')),'2026-10-25');
  assert.equal(dispatchSlot(new Date('2026-10-24T05:29:59Z')),null);
  assert.equal(dispatchSlot(new Date('2026-10-24T05:30:00Z')),'morning');
  assert.equal(dispatchSlot(new Date('2026-10-24T06:15:00Z')),'morning');
  assert.equal(dispatchSlot(new Date('2026-10-24T06:30:00Z')),null);
  assert.equal(dispatchSlot(new Date('2026-10-24T15:29:59Z')),null);
  assert.equal(dispatchSlot(new Date('2026-10-24T15:30:00Z')),'evening');
  assert.equal(dispatchSlot(new Date('2026-10-24T16:15:00Z')),'evening');
  assert.equal(dispatchSlot(new Date('2026-10-24T16:30:00Z')),null);
  assert.equal(dispatchSlot(new Date('2026-10-24T19:00:00Z')),null);
});
test('matches app thresholds and excludes disposed items, inactive stores and other stores',()=>{
  const stores=[{id:'a',is_active:true},{id:'b',is_active:true},{id:'c',is_active:false}];
  const items=[{store_id:'a',expiry_date:'2026-10-23'},{store_id:'a',expiry_date:'2026-10-24'},{store_id:'a',expiry_date:'2026-10-25'},{store_id:'a',expiry_date:'2026-10-26'},{store_id:'a',expiry_date:'2026-10-24',is_disposed:true},{store_id:'b',expiry_date:'2026-10-25'},{store_id:'c',expiry_date:'2026-10-24'}];
  assert.deepEqual(countsFor({role:'manager',store_id:'a'},stores,items,'2026-10-24'),{expired:2,today:1});
  assert.deepEqual(countsFor({role:'admin'},stores,items,'2026-10-24'),{expired:2,today:2});
  assert.deepEqual(countsFor({role:'tm'},stores,items,'2026-10-24'),{expired:2,today:2});
  assert.deepEqual(countsFor({role:'unknown',store_id:'a'},stores,items,'2026-10-24'),{expired:0,today:0});
});

test('evening summary uses current items and is empty after disposal',()=>{
  const user={role:'manager',store_id:'a'},stores=[{id:'a',is_active:true}];
  const morning=[{store_id:'a',expiry_date:'2026-10-25'}];
  assert.deepEqual(countsFor(user,stores,morning,'2026-10-24'),{expired:0,today:1});
  assert.deepEqual(countsFor(user,stores,morning.map(i=>({...i,is_disposed:true})),'2026-10-24'),{expired:0,today:0});
});
