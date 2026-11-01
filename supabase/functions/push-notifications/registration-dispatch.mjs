const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
export function registrationNotification(event) {
 return {title:'Новый сотрудник',body:`${clean(event.user_name) || 'Новый пользователь'} · ${clean(event.store_name) || 'Магазин выбран'}. Регистрация завершена.`,tag:`new-user-${event.user_id}`};
}
function checked({data,error}){if(error)throw new Error('Registration delivery database operation failed');return data;}
export async function dispatchRegistrations({db,config,send,validSubscription,userId,now=Date.now}) {
 if(!config.enabled)return {sent:0,skipped:true};
 // Limit each run; DB claim decides lease eligibility using the database clock.
 // The retry job continues remaining records without delaying registration.
 let query=db.from('push_onboarding_deliveries').select('user_id,subscription_id,attempts,lease_until').in('state',['pending','sending','failed']).lt('attempts',5).order('lease_until').limit(100);
 if(userId)query=query.eq('user_id',userId);
 const deliveries=checked(await query);
 let sent=0;const deadline=now()+45000;
 for(const delivery of deliveries){
  if(now()>deadline)break;
  const event=checked(await db.from('push_onboarding_events').select('user_id,user_name,store_name,is_baseline').eq('user_id',delivery.user_id).maybeSingle());
  const subscription=checked(await db.from('push_subscriptions').select('*').eq('id',delivery.subscription_id).maybeSingle());
  const owner=subscription?checked(await db.from('users').select('role').eq('id',subscription.user_id).maybeSingle()):null;
  const finish=async state=>checked(await db.from('push_onboarding_deliveries').update({state}).eq('user_id',delivery.user_id).eq('subscription_id',delivery.subscription_id));
  if(!event||event.is_baseline||!subscription||owner?.role!=='admin'||!validSubscription(subscription)){await finish('skipped');continue;}
  const claimed=checked(await db.rpc('claim_onboarding_delivery',{p_user_id:delivery.user_id,p_subscription_id:delivery.subscription_id}));
  if(!claimed)continue;
  try{
   const result=await send(subscription,config,registrationNotification(event));
   if(result==='sent'){await finish('sent');sent++;}
   else await finish('skipped');
  }catch{
   checked(await db.from('push_onboarding_deliveries').update({state:'failed',lease_until:new Date(now()+60000).toISOString()}).eq('user_id',delivery.user_id).eq('subscription_id',delivery.subscription_id));
  }
 }
 return {sent};
}
