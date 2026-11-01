-- Server-only event/recipient ledger: existing accounts never generate a backlog.
create schema if not exists push_private;
revoke all on schema push_private from public,anon,authenticated;
create table public.push_onboarding_events (
 user_id uuid primary key references auth.users(id) on delete cascade,
 user_name text not null,
 store_name text not null,
 created_at timestamptz not null default clock_timestamp(),
 is_baseline boolean not null default false,
 request_id bigint
);
create table public.push_onboarding_deliveries (
 user_id uuid not null references public.push_onboarding_events(user_id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 lease_until timestamptz not null default now(),
 primary key(user_id,subscription_id)
);
create index push_onboarding_retry_idx on public.push_onboarding_deliveries(lease_until) where state in ('pending','sending','failed') and attempts<5;
alter table public.push_onboarding_events enable row level security;
alter table public.push_onboarding_deliveries enable row level security;
revoke all on public.push_onboarding_events,public.push_onboarding_deliveries from public,anon,authenticated;
grant all on public.push_onboarding_events,public.push_onboarding_deliveries to service_role;
insert into public.push_onboarding_events(user_id,user_name,store_name,is_baseline)
 select u.id,coalesce(u.name,''),coalesce(s.name,''),true from public.users u join auth.users a on a.id=u.id left join public.stores s on s.id=u.store_id;

create function push_private.capture_completed_onboarding()
returns trigger language plpgsql security definer set search_path='' as $$
declare store_title text; new_event uuid; request bigint;
begin
 if new.store_id is null or coalesce(btrim(new.name),'')='' then return new; end if;
 if not exists(select 1 from auth.users where id=new.id) then return new; end if;
 select name into store_title from public.stores where id=new.store_id and is_active;
 if store_title is null then return new; end if;
 insert into public.push_onboarding_events(user_id,user_name,store_name)
 values(new.id,new.name,store_title) on conflict(user_id) do nothing returning user_id into new_event;
 if new_event is null then return new; end if;
 -- Snapshot devices of current administrators only. Later subscriptions do not receive old registrations.
 insert into public.push_onboarding_deliveries(user_id,subscription_id)
 select new.id,s.id from public.push_subscriptions s join public.users u on u.id=s.user_id where u.role='admin';
 if exists(select 1 from public.push_onboarding_deliveries where user_id=new.id) then
   begin
     select net.http_post(
       url:='https://sbsekvjjpxjpdootbsjt.supabase.co/functions/v1/push-notifications',
       headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cron_token),
       body:=jsonb_build_object('action','registrations','user_id',new.id),timeout_milliseconds:=60000)
     into request from public.push_config where id=1 and enabled;
     update public.push_onboarding_events set request_id=request where user_id=new.id;
   exception when others then
     -- Network enqueue failure must not prevent the employee entering the app.
     -- The durable delivery rows are retried by the service-only cron below.
     null;
   end;
 end if;
 return new;
end;
$$;
revoke all on function push_private.capture_completed_onboarding() from public,anon,authenticated;
create trigger notify_completed_onboarding after insert or update of store_id,name on public.users
 for each row execute function push_private.capture_completed_onboarding();

create function public.claim_onboarding_delivery(p_user_id uuid,p_subscription_id uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
 with claimed as (
  update public.push_onboarding_deliveries d set state='sending',attempts=d.attempts+1,lease_until=now()+interval '2 minutes'
  where d.user_id=$1 and d.subscription_id=$2 and d.state in ('pending','sending','failed') and d.attempts<5 and d.lease_until<=now()
   and exists(select 1 from public.push_subscriptions s join public.users u on u.id=s.user_id where s.id=$2 and u.role='admin')
   and exists(select 1 from public.push_onboarding_events e where e.user_id=$1 and not e.is_baseline)
  returning 1
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_onboarding_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_onboarding_delivery(uuid,uuid) to service_role;

-- Immediate requests are primary; this is retry/recovery only, unrelated to 08:30 / 18:30.
select cron.schedule('admin-registration-push-retry','* * * * *',$cron$
 select net.http_post(
  url:='https://sbsekvjjpxjpdootbsjt.supabase.co/functions/v1/push-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cron_token),
  body:='{"action":"registrations"}'::jsonb,timeout_milliseconds:=60000
 ) from public.push_config where id=1 and enabled and exists(
  select 1 from public.push_onboarding_deliveries where state in ('pending','sending','failed') and attempts<5 and lease_until<=now()
 );
$cron$);
