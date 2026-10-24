import test from 'node:test';
import assert from 'node:assert/strict';
import {queryWithDeadline, DATA_TIMEOUT_MS} from '../src/request-timeout.mjs';

function slowQuery(ms) {
  let signal;
  return {
    get signal() { return signal; },
    abortSignal(value) {
      signal = value;
      return new Promise(resolve => setTimeout(() => resolve({data:['loaded'],error:null}), ms));
    }
  };
}

test('response delayed 30.75 seconds succeeds without the previous 12 second cutoff',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const query=slowQuery(30750);
  const result=queryWithDeadline('Сроки годности',query);
  t.mock.timers.tick(30750);
  assert.deepEqual(await result,{data:['loaded'],error:null});
  t.mock.timers.tick(60000);
  assert.equal(query.signal.aborted,false);
});

test('a stalled request is aborted at the deadline and can be retried',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const query=slowQuery(120000);
  const result=queryWithDeadline('Сроки годности',query);
  const rejected=assert.rejects(result,/45 секунд/);
  t.mock.timers.tick(DATA_TIMEOUT_MS);
  await rejected;
  assert.equal(query.signal.aborted,true);
  const retry=queryWithDeadline('Сроки годности',slowQuery(100));
  t.mock.timers.tick(100);
  assert.deepEqual((await retry).data,['loaded']);
});

test('API failures retain the name of the failing section',async()=>{
  const query={abortSignal:()=>Promise.resolve({error:{message:'network error'}})};
  await assert.rejects(queryWithDeadline('Список магазинов',query),/Список магазинов: network error/);
});
