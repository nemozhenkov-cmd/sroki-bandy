import {test} from 'node:test';
import assert from 'node:assert/strict';
import {append,project,acknowledge,revision,discardConflict} from '../src/offline-core.mjs';
const row={id:'one',product_id:'p',store_id:'store',expiry_date:'2026-11-01',quantity:8,note:null,is_disposed:false,updated_at:'2026-10-01T00:00:00Z',products:{id:'p',barcode:'123',name:'Milk'}};
const state=()=>({owner:'user',snapshot:{items:[{...row}],products:[row.products]},queue:[]});
const op=(id,kind,patch={})=>({id,kind,item_id:'one',row:{...row,...patch}});
test('queue survives serialization and overlays cached items without altering the server copy',()=>{
 const s=append(state(),op('edit','update',{quantity:5}));
 const restored=JSON.parse(JSON.stringify(s));
 assert.equal(project(restored)[0].quantity,5);assert.equal(restored.snapshot.items[0].quantity,8);assert.equal(project(restored)[0]._pending,true);
});
test('dependent operations use the previous local state, then rebase to the acknowledged server revision',()=>{
 let s=append(state(),op('edit','update',{quantity:5}));s=append(s,op('dispose','dispose',{quantity:5,is_disposed:true}));
 assert.equal(s.queue[1].expected.quantity,5);assert.equal(project(s).length,0);
 const actual={...row,quantity:5,updated_at:'2026-10-26T18:00:00Z'};
 s=acknowledge(s,s.queue[0],{item:actual});
 assert.deepEqual(s.queue[0].expected,revision(actual));assert.equal(s.queue[0].id,'dispose');assert.equal(project(s).length,0);
});
test('acknowledgement removes only the confirmed operation and resolves product IDs for subsequent edits',()=>{
 let s={owner:'u',snapshot:{items:[],products:[]},queue:[]};
 s=append(s,op('new','add',{product_id:'local'}));s=append(s,op('edit','update',{product_id:'local',quantity:10}));
 const saved={...row,product_id:'server'};
 s=acknowledge(s,s.queue[0],{item:saved});
 assert.equal(s.queue.length,1);assert.equal(s.queue[0].expected.product_id,'server');assert.equal(project(s)[0].quantity,10);
});
test('unknown delivery outcome cannot be discarded; confirmed conflict discards the whole dependent chain',()=>{
 let s=append(state(),op('edit','update',{quantity:5}));assert.throws(()=>discardConflict(s,'one'),/результат/);
 s.queue[0].conflict={status:'conflict',item:{...row,quantity:3}};
 s=append(s,op('later','dispose',{is_disposed:true}));s=discardConflict(s,'one');
 assert.equal(s.queue.length,0);assert.equal(project(s)[0].quantity,3);
});

test('acknowledgement from a second tab cannot rewind a later server revision',()=>{
 const original=append(state(),op('edit','update',{quantity:5}));
 let s=acknowledge(original,original.queue[0],{item:{...row,quantity:5}});
 s.snapshot.items[0].quantity=2;
 s=acknowledge(s,original.queue[0],{item:{...row,quantity:5}});
 assert.equal(s.snapshot.items[0].quantity,2);
});
test('explicit form baseline is preserved instead of silently replacing it with a newer snapshot',()=>{
 const s=state();s.snapshot.items[0].quantity=4;
 const result=append(s,{...op('old-form','update',{quantity:6}),expected:revision(row)});
 assert.equal(result.queue[0].expected.quantity,8);
});

import {deliverQueue} from '../src/offline-core.mjs';
function harness(initial,deliver){let current=structuredClone(initial);return {read:async()=>structuredClone(current),update:async fn=>{current=fn(structuredClone(current))},deliver,get:()=>current};}
test('lost response retains identical operation UUID for an idempotent retry',async()=>{
 const initial=append(state(),op('stable-uuid','update',{quantity:5}));
 let attempts=0;const ids=[];
 const h=harness(initial,async operation=>{ids.push(operation.id);if(attempts++===0)throw Error('response lost');return {status:'applied',item:{...row,quantity:5}}});
 await assert.rejects(()=>deliverQueue(h),/response lost/);
 assert.equal(h.get().queue.length,1);
 assert.deepEqual(await deliverQueue(h),{sent:1,remaining:0});assert.deepEqual(ids,['stable-uuid','stable-uuid']);
});
test('one conflicted party blocks its dependent actions while unrelated parties continue',async()=>{
 let s=append(state(),op('edit','update',{quantity:5}));s=append(s,op('dispose','dispose',{quantity:5,is_disposed:true}));
 s=append(s,{id:'other',kind:'add',item_id:'two',row:{...row,id:'two'}});
 const seen=[];const h=harness(s,async o=>{seen.push(o.id);return o.id==='edit'?{status:'conflict',item:row,message:'Changed'}:{status:'applied',item:{...row,id:'two'}}});
 assert.deepEqual(await deliverQueue(h),{sent:1,remaining:2});assert.deepEqual(seen,['edit','other']);
});
test('unexpected server replies never remove a local action',async()=>{
 const h=harness(append(state(),op('edit','update')),async()=>null);
 await assert.rejects(()=>deliverQueue(h),/не подтвердил/);assert.equal(h.get().queue[0].id,'edit');
});

import {serverResult} from '../src/offline-core.mjs';
test('only confirmed transactional rejections allow review; unknown delivery outcomes remain retryable',()=>{
 assert.equal(serverResult({error:{code:'23514',message:'constraint'}}).status,'rejected');
 assert.throws(()=>serverResult({error:{code:'08006',message:'connection lost'}}),/connection lost/);
 assert.throws(()=>serverResult({error:{code:'PGRST202',message:'RPC not installed'}}),/RPC not installed/);
});
