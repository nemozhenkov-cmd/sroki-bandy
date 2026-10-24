import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateExpiry, localDate} from '../src/expiry-date.mjs';
import {statusFor} from '../src/expiry-status.mjs';

test('expiry boundary adds the full number of days',()=>{
  assert.equal(calculateExpiry('2026-10-15',10,'days'),'2026-10-25');
  assert.equal(calculateExpiry('2026-10-15',1,'days'),'2026-10-16');
  assert.equal(calculateExpiry('2026-12-31',2,'days'),'2027-01-02');
  assert.equal(calculateExpiry('2024-02-28',2,'days'),'2024-03-01');
  assert.equal(calculateExpiry('2026-12-31',1,'days'),'2027-01-01');
  assert.equal(calculateExpiry('2024-02-28',1,'days'),'2024-02-29');
  assert.equal(calculateExpiry('2026-10-24',30,'days'),'2026-11-23');
});
test('calendar months and years use the full interval with end-of-month clamping',()=>{
  assert.equal(calculateExpiry('2026-10-15',1,'months'),'2026-11-15');
  assert.equal(calculateExpiry('2026-10-15',1,'years'),'2027-10-15');
  assert.equal(calculateExpiry('2026-01-31',1,'months'),'2026-02-28');
  assert.equal(calculateExpiry('2024-01-31',1,'months'),'2024-02-29');
  assert.equal(calculateExpiry('2024-02-29',1,'years'),'2025-02-28');
  assert.equal(calculateExpiry('2026-10-24',18,'months'),'2028-04-24');
});
test('invalid or overflowing input cannot replace the expiry date',()=>{
  for(const amount of ['',0,-1,1.5,'abc',Infinity,1e16])assert.equal(calculateExpiry('2026-10-24',amount,'days'),'');
  assert.equal(calculateExpiry('2026-02-30',1,'days'),'');
  assert.equal(calculateExpiry('',1,'days'),'');
  assert.equal(calculateExpiry('9999-12-31',1,'days'),'');
  assert.equal(calculateExpiry('9999-12-31',2,'days'),'');
  assert.equal(calculateExpiry('2026-10-24',1,'hours'),'');
});
test('default date uses local calendar fields',()=>{
  assert.equal(localDate(new Date(2026,9,24,0,15)),'2026-10-24');
});

test('calculated boundary keeps last valid day in dispose-today and expires next day',()=>{
  const expiry=calculateExpiry('2026-10-15',10,'days');
  assert.equal(expiry,'2026-10-25');
  assert.equal(statusFor(expiry,new Date(2026,9,24,12)),'today');
  assert.equal(statusFor(expiry,new Date(2026,9,25,0)),'expired');
});
