-- Requests are mediated by authenticated Edge actions. No device details are exposed.
create table public.staff_push_enable_requests(
 id uuid primary key default gen_random_uuid(),
 store_id text not null references public.stores(id),
 user_id uuid not null references public.users(id) on delete cascade,
 requested_by uuid not null references public.users(id) on delete cascade,
 requested_at timestamptz not null default now(),
 snoozed_until timestamptz,
 resolved_at timestamptz,
 unique(store_id,user_id)
);
create index staff_push_request_user_idx on public.staff_push_enable_requests(user_id);
create index staff_push_request_manager_idx on public.staff_push_enable_requests(requested_by);
alter table public.staff_push_enable_requests enable row level security;
revoke all on public.staff_push_enable_requests from public,anon,authenticated;
grant all on public.staff_push_enable_requests to service_role;

create function public.manager_request_staff_push(p_actor uuid,p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.users; target public.users; r public.staff_push_enable_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('push-enable:'||p_user::text,0));
 select * into actor from public.users where id=p_actor;
 select * into target from public.users where id=p_user;
 if actor.role is distinct from 'manager' or actor.store_id is null or target.role is null or target.role not in ('rtz','srtz','srtz_rtz') or target.store_id is distinct from actor.store_id or not exists(select 1 from public.stores where id=actor.store_id and is_active) then
  raise exception 'Запрос доступен управляющему для сотрудников своего магазина' using errcode='42501';
 end if;
 if exists(select 1 from public.push_subscriptions where user_id=p_user) then return jsonb_build_object('status','already-enabled');end if;
 insert into public.staff_push_enable_requests(store_id,user_id,requested_by) values(actor.store_id,p_user,p_actor)
 on conflict(store_id,user_id) do update set id=gen_random_uuid(),requested_by=excluded.requested_by,requested_at=now(),snoozed_until=null,resolved_at=null
 where staff_push_enable_requests.resolved_at is not null;
 select * into r from public.staff_push_enable_requests where store_id=actor.store_id and user_id=p_user;
 return jsonb_build_object('status','pending','requested_at',r.requested_at);
end;$$;

create function public.get_staff_push_request(p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'requested_at',r.requested_at,'manager_name',manager.name)
 from public.staff_push_enable_requests r join public.users u on u.id=r.user_id join public.users manager on manager.id=r.requested_by join public.stores s on s.id=r.store_id
 where u.id=$1 and u.role in ('rtz','srtz','srtz_rtz') and u.store_id=r.store_id and manager.role='manager' and manager.store_id=r.store_id and s.is_active
 and r.resolved_at is null and (r.snoozed_until is null or r.snoozed_until<=now())
 and not exists(select 1 from public.push_subscriptions where user_id=u.id) limit 1;
$$;

create function public.snooze_staff_push_request(p_actor uuid,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.staff_push_enable_requests; due timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('push-enable:'||p_actor::text,0));
 select * into r from public.staff_push_enable_requests where id=p_request and user_id=p_actor for update;
 if r.id is null or public.get_staff_push_request(p_actor) is null then return jsonb_build_object('status','inactive');end if;
 due:=(((now() at time zone 'Europe/Moscow')::date+1)::timestamp at time zone 'Europe/Moscow');
 update public.staff_push_enable_requests set snoozed_until=due where id=r.id;
 return jsonb_build_object('status','snoozed','until',due);
end;$$;

create function public.manager_staff_push_requests(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare actor public.users;
begin
 select * into actor from public.users where id=p_actor;
 if actor.role is distinct from 'manager' or actor.store_id is null then raise exception 'Доступно управляющему своего магазина' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'requested_at',r.requested_at)) from public.staff_push_enable_requests r join public.users u on u.id=r.user_id join public.users m on m.id=r.requested_by join public.stores s on s.id=r.store_id
 where r.store_id=actor.store_id and r.resolved_at is null and u.store_id=r.store_id and u.role in ('rtz','srtz','srtz_rtz') and m.role='manager' and m.store_id=r.store_id and s.is_active and not exists(select 1 from public.push_subscriptions p where p.user_id=r.user_id)),'[]'::jsonb);
end;$$;

-- Every successful registration resolves requests, including older app versions and other devices.
create function push_private.resolve_staff_push_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('push-enable:'||new.user_id::text,0));
 update public.staff_push_enable_requests set resolved_at=now() where user_id=new.user_id and resolved_at is null;
 return new;
end;$$;
revoke all on function push_private.resolve_staff_push_request() from public,anon,authenticated;
create trigger resolve_staff_push_request after insert or update of user_id on public.push_subscriptions for each row execute function push_private.resolve_staff_push_request();

create function push_private.cancel_stale_staff_push_requests() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.staff_push_enable_requests set resolved_at=now() where resolved_at is null and (
 (user_id=new.id and (store_id is distinct from new.store_id or new.role not in ('rtz','srtz','srtz_rtz')))
 or (requested_by=new.id and (new.role<>'manager' or store_id is distinct from new.store_id)));
 return new;
end;$$;
revoke all on function push_private.cancel_stale_staff_push_requests() from public,anon,authenticated;
create trigger cancel_stale_staff_push_requests after update of role,store_id on public.users for each row execute function push_private.cancel_stale_staff_push_requests();

revoke all on function public.manager_request_staff_push(uuid,uuid),public.get_staff_push_request(uuid),public.snooze_staff_push_request(uuid,uuid),public.manager_staff_push_requests(uuid) from public,anon,authenticated;
grant execute on function public.manager_request_staff_push(uuid,uuid),public.get_staff_push_request(uuid),public.snooze_staff_push_request(uuid,uuid),public.manager_staff_push_requests(uuid) to service_role;
