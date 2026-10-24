import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import { APP_URL, validSubscription, moscowDay, dispatchSlot, tomorrow, countsFor, notificationBody } from './policy.mjs';

const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply = (status:number, data:unknown) => new Response(JSON.stringify(data),{status,headers});
function checked({data,error}:any) { if(error) throw new Error('Database operation failed'); return data; }
async function settings() {
  let row = checked(await db.from('push_config').select('*').eq('id',1).single());
  if (!row.public_key) {
    const keys = webpush.generateVAPIDKeys();
    checked(await db.from('push_config').update({public_key:keys.publicKey,private_key:keys.privateKey}).eq('id',1).is('public_key',null));
    row = checked(await db.from('push_config').select('*').eq('id',1).single());
  }
  return row;
}
async function send(row:any, config:any, payload:any) {
  const request = webpush.generateRequestDetails({endpoint:row.endpoint,keys:row.keys}, JSON.stringify(payload), {
    TTL:3600,urgency:'normal',vapidDetails:{subject:APP_URL,publicKey:config.public_key,privateKey:config.private_key}
  });
  const result = await fetch(request.endpoint,{method:request.method,headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(12000)});
  await result.body?.cancel();
  if(result.status === 404 || result.status === 410) {
    checked(await db.from('push_subscriptions').delete().eq('id',row.id));
    return 'gone';
  }
  if (!result.ok) throw new Error(`Push service status ${result.status}`);
  return 'sent';
}
async function allRows(table:string,columns:string,filter?:(query:any)=>any) {
  const rows:any[] = [];
  for(let start=0;start<100000;start+=500) {
    let query = db.from(table).select(columns).order('id').range(start,start+499);
    if(filter) query=filter(query);
    const page=checked(await query);
    rows.push(...page);
    if(page.length<500) return rows;
  }
  throw new Error('Dataset exceeds dispatch capacity');
}
async function dispatch(config:any) {
  const now = new Date();
  const slot = dispatchSlot(now);
  if(!config.enabled || !slot) return {sent:0,skipped:true};
  const date = moscowDay(now);
  const [subscriptions,users,stores,items] = await Promise.all([
    allRows('push_subscriptions','*'),
    allRows('users','id,role,store_id'),
    allRows('stores','id,is_active'),
    allRows('expiry_items','id,store_id,expiry_date,is_disposed',q=>q.eq('is_disposed',false).lte('expiry_date',tomorrow(date)))
  ]);
  let sent = 0;
  // Sequential requests keep runtime and provider load bounded; next cron run continues unsent devices.
  const deadline = Date.now()+45000;
  for(const subscription of subscriptions) {
    if(Date.now() > deadline) break;
    const user = users.find((u:any)=>u.id === subscription.user_id);
    if(!user || !validSubscription(subscription)) continue;
    const counts = countsFor(user,stores,items,date);
    if(!counts.expired && !counts.today) continue;
    const claimed = checked(await db.rpc('claim_push_delivery',{subscription_id:subscription.id,delivery_day:date,delivery_slot:slot}));
    if(!claimed) continue;
    try {
      const result = await send(subscription,config,{title:'Сроки годности',body:notificationBody(counts),tag:`expiry-${date}-${slot}`});
      if(result === 'sent') {
        checked(await db.from('push_deliveries').update({state:'sent'}).eq('subscription_id',subscription.id).eq('delivery_day',date).eq('delivery_slot',slot));
        sent++;
      }
    } catch {
      // Do not log endpoints, encryption keys or product data.
      checked(await db.from('push_deliveries').update({state:'failed',lease_until:new Date().toISOString()}).eq('subscription_id',subscription.id).eq('delivery_day',date).eq('delivery_slot',slot));
    }
  }
  checked(await db.from('push_deliveries').delete().lt('delivery_day',new Date(now.getTime()-30*86400000).toISOString().slice(0,10)));
  return {sent};
}
Deno.serve(async request => {
  if(request.method === 'OPTIONS') return new Response(null,{headers});
  if(request.method !== 'POST') return reply(405,{error:'Method not allowed'});
  try {
    if(Number(request.headers.get('content-length') || 0) > 8192) return reply(413,{error:'Request too large'});
    const raw = await request.text();
    if(raw.length > 8192) return reply(413,{error:'Request too large'});
    const body = JSON.parse(raw || '{}');
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /,'');
    if(!token) return reply(401,{error:'Требуется вход в приложение.'});
    if(body.action === 'dispatch') {
      const config = await settings();
      if(token !== config.cron_token) return reply(401,{error:'Unauthorized'});
      return reply(200,await dispatch(config));
    }
    const {data:{user},error} = await db.auth.getUser(token);
    if(error || !user) return reply(401,{error:'Сессия истекла. Войдите снова.'});
    if(body.action === 'config') {
      const config = await settings();
      return reply(200,{publicKey:config.public_key,enabled:config.enabled});
    }
    if(!validSubscription(body.subscription)) return reply(400,{error:'Некорректная подписка устройства.'});
    const endpoint = body.subscription.endpoint;
    if(body.action === 'subscribe') {
      // An endpoint can move accounts only after the browser creates a new subscription.
      const existing = checked(await db.from('push_subscriptions').select('user_id').eq('endpoint',endpoint).maybeSingle());
      if(existing && existing.user_id !== user.id) return reply(409,{error:'Пересоздайте подписку на этом устройстве.'});
      const count = await db.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',user.id);
      if(count.error) throw count.error;
      if(!existing && (count.count || 0) >= 10) return reply(400,{error:'Достигнут лимит устройств.'});
      const registered = checked(await db.rpc('register_push_subscription',{owner_id:user.id,push_endpoint:endpoint,push_keys:body.subscription.keys}));
      if(!registered) return reply(409,{error:'Пересоздайте подписку на этом устройстве.'});
      return reply(200,{ok:true});
    }
    if(body.action === 'status') {
      const row = checked(await db.from('push_subscriptions').select('id').eq('user_id',user.id).eq('endpoint',endpoint).maybeSingle());
      return reply(200,{subscribed:!!row});
    }
    if(body.action === 'unsubscribe') {
      checked(await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint));
      return reply(200,{ok:true});
    }
    if(body.action === 'test') {
      const row = checked(await db.from('push_subscriptions').select('*').eq('user_id',user.id).eq('endpoint',endpoint).single());
      const claimed = checked(await db.rpc('claim_push_test',{subscription_id:row.id}));
      if(!claimed) return reply(429,{error:'Повторите проверку через минуту.'});
      const result = await send(row,await settings(),{title:'Уведомления включены',body:'Это проверка уведомлений приложения «Сроки годности».',tag:'expiry-test'});
      return result === 'sent' ? reply(200,{ok:true}) : reply(410,{error:'Подписка устарела. Включите уведомления заново.'});
    }
    return reply(400,{error:'Unknown action'});
  } catch {
    return reply(503,{error:'Сервис уведомлений временно недоступен. Попробуйте позже.'});
  }
});
