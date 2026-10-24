import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateExpiry, localDate} from '../src/expiry-date.mjs';

test('days cross month/year boundaries and leap days',()=>{
  assert.equal(calculateExpiry('2026-12-31',1,'days'),'2027-01-01');
  assert.equal(calculateExpiry('2024-02-28',1,'days'),'2024-02-29');
  assert.equal(calculateExpiry('2026-10-24',30,'days'),'2026-11-23');
});
test('calendar months and years clamp to the last valid day',()=>{
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
  assert.equal(calculateExpiry('2026-10-24',1,'hours'),'');
});
test('default date uses local calendar fields',()=>{
  assert.equal(localDate(new Date(2026,9,24,0,15)),'2026-10-24');
});
