import test from 'node:test';
import assert from 'node:assert/strict';
import {daysLeft,statusFor} from '../src/expiry-status.mjs';

test('today is distinct from expired, soon and ok',()=>{
  const now=new Date(2026,9,24,15,30);
  assert.equal(statusFor('2026-10-23',now),'expired');
  assert.equal(statusFor('2026-10-24',now),'today');
  assert.equal(statusFor('2026-10-25',now),'soon');
  assert.equal(statusFor('2026-10-27',now),'soon');
  assert.equal(statusFor('2026-10-28',now),'ok');
  const dates=['2026-10-23','2026-10-24','2026-10-25','2026-10-27','2026-10-28'];
  const groups=Object.fromEntries(['expired','today','soon','ok'].map(s=>[s,dates.filter(d=>statusFor(d,now)===s).length]));
  assert.deepEqual(groups,{expired:1,today:1,soon:2,ok:1});
  assert.equal(Object.values(groups).reduce((a,b)=>a+b),dates.length);
});

test('status changes at local midnight, including year boundary',()=>{
  assert.equal(statusFor('2027-01-01',new Date(2026,11,31,23,59)),'soon');
  assert.equal(statusFor('2027-01-01',new Date(2027,0,1,0,1)),'today');
  assert.equal(statusFor('2027-01-01',new Date(2027,0,2,0,1)),'expired');
});

test('calendar-day differences remain whole across daylight-saving transitions',()=>{
  assert.equal(daysLeft('2026-03-30',new Date(2026,2,28,23,59)),2);
  assert.equal(daysLeft('2026-10-26',new Date(2026,9,24,23,59)),2);
});
