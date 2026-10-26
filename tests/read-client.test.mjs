import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
test('startup data reads use the obtained session token without another Auth request',async()=>{
 const calls=[];
 const client=createClient('https://example.supabase.co','public-test-key',{
  accessToken:async()=>'existing-session-token',
  global:{fetch:async(url,options)=>{
   calls.push({url:String(url),authorization:new Headers(options.headers).get('authorization')});
   return new Response(JSON.stringify([{id:'cached-reader'}]),{status:200,headers:{'Content-Type':'application/json'}});
  }}
 });
 const result=await client.from('expiry_items').select('id');
 assert.equal(result.data[0].id,'cached-reader');
 assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/rest/v1/expiry_items'));
 assert.equal(calls[0].authorization,'Bearer existing-session-token');
});
