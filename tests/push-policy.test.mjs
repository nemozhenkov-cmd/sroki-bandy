import test from 'node:test';
import assert from 'node:assert/strict';
import {validSubscription,countsFor,moscowDay,dispatchWindow} from '../supabase/functions/push-notifications/policy.mjs';
const subscription = endpoint=>({endpoint,keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}});
test('push only reaches known TLS providers; blocks SSRF, userinfo, lookalike hosts and invalid keys',()=>{
  for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.notify.windows.com']) assert.ok(validSubscription(subscription(`https://${host}/send/abc`)));
  for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://evilpush.apple.com/a','https://127.0.0.1/','https://fcm.googleapis.com:444/a','https://u:p@fcm.googleapis.com/a']) assert.ok(!validSubscription(subscription(url)),url);
  assert.ok(!validSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{p256dh:'a',auth:'b'}}));
});
test('uses Moscow date and morning time even across UTC date boundary',()=>{
  assert.equal(moscowDay(new Date('2026-10-24T22:00:00Z')),'2026-10-25');
  assert.equal(dispatchWindow(new Date('2026-10-24T05:29:59Z')),false);
  assert.equal(dispatchWindow(new Date('2026-10-24T05:30:00Z')),true);
  assert.equal(dispatchWindow(new Date('2026-10-24T19:00:00Z')),false);
});
test('matches app thresholds and excludes disposed items, inactive stores and other stores',()=>{
  const stores=[{id:'a',is_active:true},{id:'b',is_active:true},{id:'c',is_active:false}];
  const items=[{store_id:'a',expiry_date:'2026-10-23'},{store_id:'a',expiry_date:'2026-10-24'},{store_id:'a',expiry_date:'2026-10-25'},{store_id:'a',expiry_date:'2026-10-26'},{store_id:'a',expiry_date:'2026-10-24',is_disposed:true},{store_id:'b',expiry_date:'2026-10-25'},{store_id:'c',expiry_date:'2026-10-24'}];
  assert.deepEqual(countsFor({role:'manager',store_id:'a'},stores,items,'2026-10-24'),{expired:2,today:1});
  assert.deepEqual(countsFor({role:'admin'},stores,items,'2026-10-24'),{expired:2,today:2});
  assert.deepEqual(countsFor({role:'tm'},stores,items,'2026-10-24'),{expired:2,today:2});
  assert.deepEqual(countsFor({role:'unknown',store_id:'a'},stores,items,'2026-10-24'),{expired:0,today:0});
});
