import test from 'node:test';
import assert from 'node:assert/strict';
import {daysLeft,statusFor} from '../src/expiry-status.mjs';

test('zero days is expired, one day requires disposal, two to seven days is soon',()=>{
  const now=new Date(2026,9,24,15,30);
  assert.equal(statusFor('2026-10-23',now),'expired');
  assert.equal(statusFor('2026-10-24',now),'expired');
  assert.equal(statusFor('2026-10-25',now),'today');
  assert.equal(statusFor('2026-10-26',now),'soon');
  assert.equal(statusFor('2026-10-27',now),'soon');
  assert.equal(statusFor('2026-10-28',now),'soon');
  assert.equal(statusFor('2026-10-31',now),'soon');
  assert.equal(statusFor('2026-11-01',now),'ok');
  const dates=['2026-10-23','2026-10-24','2026-10-25','2026-10-31','2026-11-01'];
  const groups=Object.fromEntries(['expired','today','soon','ok'].map(s=>[s,dates.filter(d=>statusFor(d,now)===s).length]));
  assert.deepEqual(groups,{expired:2,today:1,soon:1,ok:1});
  assert.equal(Object.values(groups).reduce((a,b)=>a+b),dates.length);
});

test('status changes at local midnight, including year boundary',()=>{
  assert.equal(statusFor('2027-01-01',new Date(2026,11,31,23,59)),'today');
  assert.equal(statusFor('2027-01-01',new Date(2027,0,1,0,1)),'expired');
  assert.equal(statusFor('2027-01-01',new Date(2027,0,2,0,1)),'expired');
});

test('calendar-day differences remain whole across daylight-saving transitions',()=>{
  assert.equal(daysLeft('2026-03-30',new Date(2026,2,28,23,59)),2);
  assert.equal(daysLeft('2026-10-26',new Date(2026,9,24,23,59)),2);
});
