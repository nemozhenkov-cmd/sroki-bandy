import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchRegistrations,registrationNotification} from '../supabase/functions/push-notifications/registration-dispatch.mjs';
function fixture(){
 let clock=Date.parse('2026-11-01T11:17:00Z'); // Outside both expiry-delivery windows.
 const tables={push_onboarding_events:[{user_id:'new',user_name:'Анна Иванова',store_name:'Учебный магазин',is_baseline:false}],push_subscriptions:[{id:'device',user_id:'admin',endpoint:'fake'}],users:[{id:'admin',role:'admin'}],push_onboarding_deliveries:[{user_id:'new',subscription_id:'device',state:'pending',attempts:0,lease_until:new Date(clock).toISOString()}]};
 const db={from(name){let conditions=[],limit=Infinity,single=false,change=null;const q={select(){return q},eq(k,v){conditions.push(x=>x[k]===v);return q},in(k,v){conditions.push(x=>v.includes(x[k]));return q},lt(k,v){conditions.push(x=>x[k]<v);return q},lte(k,v){conditions.push(x=>x[k]<=v);return q},order(){return q},limit(v){limit=v;return q},maybeSingle(){single=true;return q},update(v){change=v;return q},then(ok,bad){const data=tables[name].filter(x=>conditions.every(f=>f(x))).slice(0,limit);if(change)data.forEach(x=>Object.assign(x,change));return Promise.resolve({data:single?data[0]||null:data}).then(ok,bad)}};return q},async rpc(name,args){const d=tables.push_onboarding_deliveries.find(x=>x.user_id===args.p_user_id&&x.subscription_id===args.p_subscription_id);if(!d||d.state==='sent'||d.attempts>=5||Date.parse(d.lease_until)>clock)return {data:false};d.state='sending';d.attempts++;d.lease_until=new Date(clock+120000).toISOString();return {data:true}}};
 const sent=[];return {tables,db,sent,now:()=>clock,advance:()=>{clock+=61000},send:async(sub,c,payload)=>{sent.push({sub,payload});return 'sent'}};
}
async function run(f,extra={}){return dispatchRegistrations({db:f.db,config:{enabled:true},send:f.send,validSubscription:()=>true,now:f.now,...extra});}
test('admin gets one completed-registration push immediately outside expiry schedule; repeated dispatch does not resend',async()=>{
 const f=fixture();assert.equal((await run(f,{userId:'new'})).sent,1);assert.equal((await run(f)).sent,0);assert.equal(f.sent.length,1);assert.match(f.sent[0].payload.body,/Анна Иванова.*Учебный магазин/);assert.equal(f.sent[0].sub.user_id,'admin');
});
test('role change, invalid device, absent profile, baseline and global disable never produce registration push',async()=>{
 for(const mutate of [f=>f.tables.users[0].role='manager',f=>f.tables.users[0].role='rtz',f=>f.tables.push_onboarding_events[0].is_baseline=true,f=>f.tables.push_onboarding_events=[]]){
  const f=fixture();mutate(f);assert.equal((await run(f)).sent,0);assert.equal(f.sent.length,0);
 }
 const f=fixture();assert.equal((await run(f,{config:{enabled:false}})).sent,0);assert.equal((await run(f,{validSubscription:()=>false})).sent,0);
});
test('network error retains durable delivery and stable notification tag; retry succeeds once',async()=>{
 const f=fixture();const expected=registrationNotification(f.tables.push_onboarding_events[0]);await run(f,{send:async()=>{throw Error('network')}});assert.equal(f.tables.push_onboarding_deliveries[0].state,'failed');assert.equal(f.sent.length,0);
 assert.equal((await run(f)).sent,0);f.advance();assert.equal((await run(f)).sent,1);assert.equal(f.sent[0].payload.tag,expected.tag);assert.equal((await run(f)).sent,0);
});
test('two concurrent invocations share a lease and deliver once',async()=>{
 const f=fixture();await Promise.all([run(f),run(f)]);assert.equal(f.sent.length,1);
});
test('notification truncates user text, strips control characters and uses stable per-user tag',()=>{
 const p=registrationNotification({user_id:'id',user_name:' Анна\nИванова\u0000 ',store_name:'А'.repeat(500)});assert.ok(!p.body.includes('\n'));assert.ok(!p.body.includes('\u0000'));assert.ok(p.body.length<250);assert.equal(p.tag,'new-user-id');
});
