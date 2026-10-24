-- Morning and evening deliveries are independent; both retain deduplication/retries.
begin;
alter table public.push_deliveries add column delivery_slot text not null default 'morning'
  check (delivery_slot in ('morning','evening'));
alter table public.push_deliveries drop constraint push_deliveries_pkey;
alter table public.push_deliveries add primary key(subscription_id,delivery_day,delivery_slot);
drop function public.claim_push_delivery(uuid,date);
create function public.claim_push_delivery(subscription_id uuid, delivery_day date, delivery_slot text) returns boolean
language sql volatile security invoker set search_path = '' as $$
  with claimed as (
    insert into public.push_deliveries as d(subscription_id,delivery_day,delivery_slot,state)
    values ($1,$2,$3,'sending')
    on conflict(subscription_id,delivery_day,delivery_slot) do update
    set state='sending',attempts=d.attempts+1,lease_until=now()+interval '2 minutes'
    where d.state <> 'sent' and d.lease_until < now() and d.attempts < 3
    returning 1
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_push_delivery(uuid,date,text) from public,anon,authenticated;
grant execute on function public.claim_push_delivery(uuid,date,text) to service_role;
commit;
