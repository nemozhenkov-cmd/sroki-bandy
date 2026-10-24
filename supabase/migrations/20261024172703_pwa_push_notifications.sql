-- Additive infrastructure. Daily sending stays disabled until release approval.
create table public.push_config (
  id integer primary key check (id = 1),
  public_key text,
  private_key text,
  cron_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  enabled boolean not null default false
);
insert into public.push_config(id) values (1);
alter table public.push_config enable row level security;
revoke all on public.push_config from public, anon, authenticated;
grant all on public.push_config to service_role;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check(length(endpoint) < 2048),
  keys jsonb not null,
  last_test_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant all on public.push_subscriptions to service_role;
-- Subscribers can inspect/delete their own device registrations. Registration requires the authenticated Edge Function.
grant select, delete on public.push_subscriptions to authenticated;
create policy push_own_select on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_own_delete on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create table public.push_deliveries (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivery_day date not null,
  state text not null check(state in ('sending','sent','failed')),
  attempts integer not null default 1,
  lease_until timestamptz not null default now()+interval '2 minutes',
  primary key(subscription_id,delivery_day)
);
create index push_deliveries_day_idx on public.push_deliveries(delivery_day);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public, anon, authenticated;
grant all on public.push_deliveries to service_role;

create function public.claim_push_delivery(subscription_id uuid, delivery_day date) returns boolean
language sql volatile security invoker set search_path = '' as $$
  with claimed as (
    insert into public.push_deliveries as d(subscription_id,delivery_day,state)
    values ($1,$2,'sending')
    on conflict(subscription_id,delivery_day) do update
    set state='sending',attempts=d.attempts+1,lease_until=now()+interval '2 minutes'
    where d.state <> 'sent' and d.lease_until < now() and d.attempts < 3
    returning 1
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_push_delivery(uuid,date) from public,anon,authenticated;
grant execute on function public.claim_push_delivery(uuid,date) to service_role;

create function public.claim_push_test(subscription_id uuid) returns boolean
language sql volatile security invoker set search_path = '' as $$
  with claimed as (
    update public.push_subscriptions set last_test_at=now()
    where id=$1 and (last_test_at is null or last_test_at < now()-interval '1 minute') returning 1
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_push_test(uuid) from public,anon,authenticated;
grant execute on function public.claim_push_test(uuid) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Token remains in the service-only table, never in the cron command or frontend.
select cron.schedule('expiry-push-daily','*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://sbsekvjjpxjpdootbsjt.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || cron_token),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 60000
  ) from public.push_config where id=1 and enabled;
$cron$);

create function public.register_push_subscription(owner_id uuid, push_endpoint text, push_keys jsonb) returns boolean
language sql volatile security invoker set search_path = '' as $$
  with registered as (
    insert into public.push_subscriptions as s(user_id,endpoint,keys) values ($1,$2,$3)
    on conflict(endpoint) do update set keys=excluded.keys where s.user_id=excluded.user_id
    returning 1
  ) select exists(select 1 from registered);
$$;
revoke all on function public.register_push_subscription(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_push_subscription(uuid,text,jsonb) to service_role;
