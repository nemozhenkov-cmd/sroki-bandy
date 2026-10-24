import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshQueue} from '../src/refresh-queue.mjs';

test('bursts during a request run one trailing refresh without overlap',async()=>{
  const keys=[];
  let release;
  const first=new Promise(resolve=>{release=resolve;});
  let active=0,maxActive=0;
  const refresh=createRefreshQueue(async key=>{
    active++;maxActive=Math.max(maxActive,active);keys.push(key);
    if(keys.length===1)await first;
    active--;
  });
  const result=refresh('user');
  await Promise.resolve();
  for(let i=0;i<50;i++)refresh('user');
  refresh('new-user');
  release();await result;
  assert.deepEqual(keys,['user','new-user']);
  assert.equal(maxActive,1);
  await refresh('later');
  assert.equal(keys.at(-1),'later');
});
test('queue can retry after a failed request',async()=>{
  let fail=true;
  const refresh=createRefreshQueue(async()=>{if(fail)throw new Error('offline');});
  await assert.rejects(refresh('user'),/offline/);
  fail=false;
  await refresh('user');
});
