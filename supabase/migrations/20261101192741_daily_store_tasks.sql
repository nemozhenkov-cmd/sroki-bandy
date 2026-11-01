create table public.store_task_catalog(id smallint primary key check(id between 1 and 14),title text not null,deadline time not null);
insert into public.store_task_catalog values (1,'Утренний отчёт в группу','08:30'),(2,'Проведение пятиминутки','08:45'),(3,'Пересчет главной кассы','09:00'),(4,'Пересчет ТОП','10:00'),(5,'Пересчет ЛИ','12:00'),(6,'Закрытие смены сотруднику Клининга','14:00'),(7,'Проверка сроков годности','18:30'),(8,'Пересчет ГАП','19:00'),(9,'Подготовка склада на след. день','20:00'),(10,'Пересчет главной кассы','20:30'),(11,'Проверка холодильных бонет (створки/работоспособность)','20:45'),(12,'Проверка дверей магазина','20:58'),(13,'Проведение табеля сотрудникам в т.ч. СМЗ','21:00'),(14,'Вы отлично провели смену! Доброй ночи :)','21:03');
create function public.task_workday(p_day date,p_start date) returns boolean language sql immutable set search_path='' as $$select p_day>=p_start and (p_day-p_start)%4<2$$;
create function public.default_store_task_reminders() returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_agg(jsonb_build_object('task_id',id,'enabled',false,'time',to_char(deadline,'HH24:MI')) order by id) from public.store_task_catalog$$;
create function public.valid_store_task_reminders(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare r jsonb; seen integer[]:='{}'; n integer;
begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)<>14 then return false;end if;
 for r in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'enabled') is distinct from 'boolean' or coalesce(r->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(r->>'task_id','')!~'^[0-9]{1,2}$' then return false;end if;
  n:=(r->>'task_id')::int;if n<1 or n>14 or n=any(seen) then return false;end if;seen:=array_append(seen,n);
 end loop;return true;
end;$$;
create table public.store_task_settings(
 store_id text primary key references public.stores(id),enabled boolean not null default false,
 reminders jsonb not null check(public.valid_store_task_reminders(reminders)),updated_at timestamptz not null default now()
);
create table public.store_task_schedules(
 store_id text not null references public.stores(id),user_id uuid not null references public.users(id) on delete cascade,
 start_date date not null check(start_date between date '2000-01-01' and date '2100-12-31'),updated_at timestamptz not null default now(),primary key(store_id,user_id)
);
create table public.store_task_completions(
 store_id text not null references public.stores(id),task_day date not null,task_id smallint not null references public.store_task_catalog(id),
 completed_by uuid references public.users(id) on delete set null,completed_name text not null,completed_at timestamptz not null default now(),primary key(store_id,task_day,task_id)
);
create table public.store_task_notices(
 id uuid primary key default gen_random_uuid(),store_id text not null references public.stores(id),task_day date not null,task_id smallint not null references public.store_task_catalog(id),
 user_id uuid not null references public.users(id) on delete cascade,next_due_at timestamptz not null,generation integer not null default 0,closed boolean not null default false,
 unique(store_id,task_day,task_id,user_id)
);
create table public.store_task_push_deliveries(
 id uuid primary key default gen_random_uuid(),notice_id uuid not null references public.store_task_notices(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,generation integer not null,
 action_token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),attempts int not null default 0,lease_until timestamptz not null default now(),
 used_action text,action_result jsonb,unique(notice_id,subscription_id,generation)
);
create index store_task_due_idx on public.store_task_notices(next_due_at) where not closed;
create index store_task_pending_push_idx on public.store_task_push_deliveries(lease_until) where state in ('pending','sending','failed') and attempts<3;
alter table public.store_task_catalog enable row level security;
alter table public.store_task_settings enable row level security;
alter table public.store_task_schedules enable row level security;
alter table public.store_task_completions enable row level security;
alter table public.store_task_notices enable row level security;
alter table public.store_task_push_deliveries enable row level security;
revoke all on public.store_task_catalog,public.store_task_settings,public.store_task_schedules,public.store_task_completions,public.store_task_notices,public.store_task_push_deliveries from public,anon,authenticated;
grant all on public.store_task_catalog,public.store_task_settings,public.store_task_schedules,public.store_task_completions,public.store_task_notices,public.store_task_push_deliveries to service_role;
grant select on public.store_task_catalog,public.store_task_settings,public.store_task_schedules,public.store_task_completions to authenticated;
grant insert,update on public.store_task_settings to authenticated;
grant insert,update,delete on public.store_task_schedules to authenticated;
grant insert on public.store_task_completions to authenticated;
create policy task_catalog_members on public.store_task_catalog for select to authenticated using(exists(select 1 from public.users where id=auth.uid() and role in ('manager','srtz')));
create policy task_settings_read on public.store_task_settings for select to authenticated using(exists(select 1 from public.users where id=auth.uid() and role in ('manager','srtz') and store_id=store_task_settings.store_id));
create policy task_settings_insert on public.store_task_settings for insert to authenticated with check(public.is_manager() and store_id=public.current_user_store_id());
create policy task_settings_update on public.store_task_settings for update to authenticated using(public.is_manager() and store_id=public.current_user_store_id()) with check(public.is_manager() and store_id=public.current_user_store_id());
create policy task_schedules_read on public.store_task_schedules for select to authenticated using(store_id=public.current_user_store_id() and (public.is_manager() or (user_id=auth.uid() and exists(select 1 from public.users where id=auth.uid() and role='srtz'))));
create policy task_schedules_write on public.store_task_schedules for all to authenticated using(public.is_manager() and store_id=public.current_user_store_id()) with check(public.is_manager() and store_id=public.current_user_store_id() and exists(select 1 from public.users u where u.id=store_task_schedules.user_id and u.store_id=store_task_schedules.store_id and (u.role='srtz' or (u.id=auth.uid() and u.role='manager'))));
create policy task_completions_read on public.store_task_completions for select to authenticated using(exists(select 1 from public.users where id=auth.uid() and role in ('manager','srtz') and store_id=store_task_completions.store_id));
create policy task_completions_insert on public.store_task_completions for insert to authenticated with check(completed_by=auth.uid() and task_day=(now() at time zone 'Europe/Moscow')::date and exists(select 1 from public.users u join public.stores s on s.id=u.store_id join public.store_task_settings st on st.store_id=s.id where u.id=auth.uid() and u.role in ('manager','srtz') and s.is_active and st.enabled and s.id=store_task_completions.store_id));

grant select on public.store_task_notices to authenticated;
create policy task_notice_own_read on public.store_task_notices for select to authenticated using(user_id=auth.uid() and store_id=public.current_user_store_id() and exists(select 1 from public.users where id=auth.uid() and role in ('manager','srtz')));

create function push_private.task_settings_stamp() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at:=now();return new;end;$$;
create trigger task_settings_stamp before insert or update on public.store_task_settings for each row execute function push_private.task_settings_stamp();
create trigger task_schedules_stamp before insert or update on public.store_task_schedules for each row execute function push_private.task_settings_stamp();
create function push_private.task_completion_stamp() returns trigger language plpgsql security invoker set search_path='' as $$begin perform pg_advisory_xact_lock(hashtextextended(new.store_id||new.task_day::text||new.task_id::text,0));new.completed_at:=now();if current_setting('role',true)='authenticated' then new.completed_by:=auth.uid();select name into new.completed_name from public.users where id=auth.uid();end if;return new;end;$$;
create trigger task_completion_stamp before insert on public.store_task_completions for each row execute function push_private.task_completion_stamp();
create function push_private.close_completed_task_notices() returns trigger language plpgsql security definer set search_path='' as $$begin update public.store_task_notices set closed=true where store_id=new.store_id and task_day=new.task_day and task_id=new.task_id;return new;end;$$;
revoke all on function push_private.close_completed_task_notices() from public,anon,authenticated;
create trigger close_completed_task_notices after insert on public.store_task_completions for each row execute function push_private.close_completed_task_notices();

create function public.get_store_task_day() returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.users; st public.store_task_settings; d date:=(now() at time zone 'Europe/Moscow')::date;
begin
 select * into actor from public.users where id=auth.uid();if actor.role is null or actor.role not in ('manager','srtz') then raise exception 'Задачи доступны только СРТЗ и управляющему' using errcode='42501';end if;
 select * into st from public.store_task_settings where store_id=actor.store_id;
 return jsonb_build_object('store_id',actor.store_id,'day',d,'server_time',now(),'enabled',coalesce(st.enabled,false),'reminders',coalesce(st.reminders,public.default_store_task_reminders()),
 'schedules',coalesce((select jsonb_agg(to_jsonb(x)) from public.store_task_schedules x join public.users member on member.id=x.user_id where x.store_id=actor.store_id and member.store_id=actor.store_id and (member.role='srtz' or member.id=actor.id)),'[]'::jsonb),
 'notices',coalesce((select jsonb_agg(to_jsonb(x)) from public.store_task_notices x where x.store_id=actor.store_id and x.user_id=actor.id and x.task_day=d),'[]'::jsonb),'completions',coalesce((select jsonb_agg(to_jsonb(x)) from public.store_task_completions x where x.store_id=actor.store_id and x.task_day=d),'[]'::jsonb));
end;$$;
create function public.save_store_task_settings(p_enabled boolean,p_reminders jsonb,p_schedules jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.users; r jsonb;
begin
 select * into actor from public.users where id=auth.uid();if actor.role is distinct from 'manager' or not exists(select 1 from public.stores where id=actor.store_id and is_active) then raise exception 'Настройки доступны управляющему своего активного магазина' using errcode='42501';end if;
 if p_enabled is null or not public.valid_store_task_reminders(p_reminders) or jsonb_typeof(p_schedules) is distinct from 'array' or jsonb_array_length(p_schedules)>200 then raise exception 'Проверьте задачи и графики';end if;
 insert into public.store_task_settings(store_id,enabled,reminders) values(actor.store_id,p_enabled,p_reminders) on conflict(store_id) do update set enabled=excluded.enabled,reminders=excluded.reminders;
 delete from public.store_task_schedules where store_id=actor.store_id;
 for r in select value from jsonb_array_elements(p_schedules) loop
  insert into public.store_task_schedules(store_id,user_id,start_date) values(actor.store_id,(r->>'user_id')::uuid,(r->>'start_date')::date);
 end loop;
 return public.get_store_task_day();
end;$$;
create function public.complete_store_task(p_task_id smallint,p_day date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.users; result public.store_task_completions;
begin
 select * into actor from public.users where id=auth.uid();if actor.role is null or actor.role not in ('manager','srtz') or p_day is distinct from (now() at time zone 'Europe/Moscow')::date then raise exception 'Можно выполнить только задачу текущего дня своего магазина' using errcode='42501';end if;
 insert into public.store_task_completions(store_id,task_day,task_id,completed_by,completed_name) values(actor.store_id,p_day,p_task_id,actor.id,actor.name) on conflict do nothing;
 select * into result from public.store_task_completions where store_id=actor.store_id and task_day=p_day and task_id=p_task_id;
 return to_jsonb(result);
end;$$;

-- Notice eligibility is always rechecked against current store/role/schedule/config.
create function public.task_notice_allowed(p_notice uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.store_task_notices n join public.users u on u.id=n.user_id join public.stores s on s.id=n.store_id join public.store_task_settings st on st.store_id=n.store_id join public.store_task_schedules sc on sc.store_id=n.store_id and sc.user_id=n.user_id cross join lateral jsonb_to_recordset(st.reminders) r(task_id int,enabled boolean,time text)
 where n.id=$1 and not n.closed and n.task_day=(now() at time zone 'Europe/Moscow')::date and u.store_id=n.store_id and u.role in ('manager','srtz') and s.is_active and st.enabled and r.task_id=n.task_id and r.enabled and public.task_workday(n.task_day,sc.start_date)
 and (n.generation>0 or n.next_due_at=((n.task_day::text||' '||r.time)::timestamp at time zone 'Europe/Moscow'))
 and not exists(select 1 from public.store_task_completions c where c.store_id=n.store_id and c.task_day=n.task_day and c.task_id=n.task_id));
$$;
create function public.prepare_store_task_push() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from public.store_task_notices where task_day<(now() at time zone 'Europe/Moscow')::date-30;
 -- Retiming an unsent initial reminder must not lose the new time or resend delivered reminders.
 update public.store_task_notices n set next_due_at=((n.task_day::text||' '||r.time)::timestamp at time zone 'Europe/Moscow')
 from public.store_task_settings st cross join lateral jsonb_to_recordset(st.reminders) r(task_id int,enabled boolean,time text)
 where n.store_id=st.store_id and n.task_id=r.task_id and n.task_day=(now() at time zone 'Europe/Moscow')::date and n.generation=0 and not n.closed
 and not exists(select 1 from public.store_task_push_deliveries d where d.notice_id=n.id and (d.state='sent' or d.attempts>0));
 insert into public.store_task_notices(store_id,task_day,task_id,user_id,next_due_at)
 select st.store_id,(now() at time zone 'Europe/Moscow')::date,r.task_id,sc.user_id,v.due
 from public.store_task_settings st join public.stores s on s.id=st.store_id join public.store_task_schedules sc on sc.store_id=st.store_id join public.users u on u.id=sc.user_id cross join lateral jsonb_to_recordset(st.reminders) r(task_id smallint,enabled boolean,time text)
 cross join lateral (select (((now() at time zone 'Europe/Moscow')::date::text||' '||r.time)::timestamp at time zone 'Europe/Moscow') due) v
 where st.enabled and s.is_active and r.enabled and u.store_id=st.store_id and u.role in ('srtz','manager') and public.task_workday((now() at time zone 'Europe/Moscow')::date,sc.start_date)
 and v.due<=now() and v.due>=now()-interval '15 minutes' and v.due>=greatest(st.updated_at,sc.updated_at)
 and not exists(select 1 from public.store_task_completions c where c.store_id=st.store_id and c.task_day=(now() at time zone 'Europe/Moscow')::date and c.task_id=r.task_id)
 on conflict do nothing;
 insert into public.store_task_push_deliveries(notice_id,subscription_id,generation)
 select n.id,s.id,n.generation from public.store_task_notices n join public.push_subscriptions s on s.user_id=n.user_id where public.task_notice_allowed(n.id) and n.next_due_at<=now() and n.next_due_at>=now()-interval '15 minutes' on conflict do nothing;
end;$$;
create function public.claim_next_store_task_push() returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.store_task_push_deliveries; n public.store_task_notices; t public.store_task_catalog; sub public.push_subscriptions;
begin
 select x.* into d from public.store_task_push_deliveries x join public.store_task_notices z on z.id=x.notice_id join public.push_subscriptions s on s.id=x.subscription_id
 where x.state in ('pending','sending','failed') and x.attempts<3 and x.lease_until<=now() and x.generation=z.generation and z.next_due_at<=now() and z.next_due_at>=now()-interval '15 minutes' and s.user_id=z.user_id and public.task_notice_allowed(z.id)
 order by z.next_due_at,x.id limit 1 for update of x skip locked;
 if d.id is null then return null;end if;
 update public.store_task_push_deliveries set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id=d.id;
 select * into n from public.store_task_notices where id=d.notice_id;select * into t from public.store_task_catalog where id=n.task_id;select * into sub from public.push_subscriptions where id=d.subscription_id;
 return jsonb_build_object('delivery_id',d.id,'notice_id',n.id,'generation',n.generation,'task_id',n.task_id,'task_day',n.task_day,'title',t.title,'deadline',t.deadline,'action_token',d.action_token,'subscription',to_jsonb(sub));
end;$$;
create function public.finish_store_task_push(p_delivery_id uuid,p_state text) returns void language sql security invoker set search_path='' as $$update public.store_task_push_deliveries set state=$2,lease_until=case when $2='failed' then now()+interval '1 minute' else lease_until end where id=$1 and $2 in ('sent','failed','skipped')$$;

-- Service-only capability action. A token can act only on its user's assigned task for today.
create function public.apply_store_task_push_action(p_token text,p_action text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.store_task_push_deliveries; n public.store_task_notices; actor public.users; result jsonb;
begin
 if p_action is null or p_action not in ('done','snooze') or length(p_token)<>64 then raise exception 'Недопустимое действие' using errcode='42501';end if;
 select * into d from public.store_task_push_deliveries where action_token=p_token;
 if d.id is null then raise exception 'Уведомление недействительно' using errcode='42501';end if;
 select * into n from public.store_task_notices where id=d.notice_id;
 perform pg_advisory_xact_lock(hashtextextended(n.store_id||n.task_day::text||n.task_id::text,0));
 select * into n from public.store_task_notices where id=d.notice_id for update;
 select * into d from public.store_task_push_deliveries where id=d.id;
 if d.used_action is not null then return d.action_result;end if;
 if exists(select 1 from public.store_task_completions c where c.store_id=n.store_id and c.task_day=n.task_day and c.task_id=n.task_id) and n.task_day=(now() at time zone 'Europe/Moscow')::date then return jsonb_build_object('status','done');end if;
 if not public.task_notice_allowed(n.id) or not exists(select 1 from public.push_subscriptions where id=d.subscription_id and user_id=n.user_id) then raise exception 'Задача или назначение больше неактуальны' using errcode='42501';end if;
 select * into actor from public.users where id=n.user_id;
 if p_action='done' then
  insert into public.store_task_completions(store_id,task_day,task_id,completed_by,completed_name) values(n.store_id,n.task_day,n.task_id,n.user_id,actor.name) on conflict do nothing;result:=jsonb_build_object('status','done');
 else
  if d.generation<>n.generation then return jsonb_build_object('status','stale');end if;
  update public.store_task_notices set generation=generation+1,next_due_at=clock_timestamp()+interval '10 minutes' where id=n.id returning * into n;result:=jsonb_build_object('status','snoozed','next_due_at',n.next_due_at);
 end if;
 update public.store_task_push_deliveries set used_action=p_action,action_result=result where id=d.id;
 return result;
end;$$;
create function public.snooze_store_task_for_user(p_user uuid,p_task_id smallint,p_day date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare n public.store_task_notices;
begin
 select * into n from public.store_task_notices where user_id=p_user and task_id=p_task_id and task_day=p_day;
 if n.id is not null then perform pg_advisory_xact_lock(hashtextextended(n.store_id||n.task_day::text||n.task_id::text,0));select * into n from public.store_task_notices where id=n.id for update;end if;
 if n.id is null or not public.task_notice_allowed(n.id) then raise exception 'Для вас нет активного напоминания по этой задаче' using errcode='42501';end if;
 update public.store_task_notices set generation=generation+1,next_due_at=clock_timestamp()+interval '10 minutes' where id=n.id returning * into n;
 return jsonb_build_object('status','snoozed','next_due_at',n.next_due_at);
end;$$;
-- Lock down all helpers; only three authenticated endpoints are exposed.
revoke all on function public.task_workday(date,date),public.default_store_task_reminders(),public.valid_store_task_reminders(jsonb),public.get_store_task_day(),public.save_store_task_settings(boolean,jsonb,jsonb),public.complete_store_task(smallint,date),public.task_notice_allowed(uuid),public.prepare_store_task_push(),public.claim_next_store_task_push(),public.finish_store_task_push(uuid,text),public.apply_store_task_push_action(text,text),public.snooze_store_task_for_user(uuid,smallint,date) from public,anon,authenticated;
grant execute on function public.task_workday(date,date),public.default_store_task_reminders(),public.valid_store_task_reminders(jsonb),public.get_store_task_day(),public.save_store_task_settings(boolean,jsonb,jsonb),public.complete_store_task(smallint,date) to authenticated;
grant execute on function public.task_workday(date,date),public.default_store_task_reminders(),public.valid_store_task_reminders(jsonb),public.task_notice_allowed(uuid),public.prepare_store_task_push(),public.claim_next_store_task_push(),public.finish_store_task_push(uuid,text),public.apply_store_task_push_action(text,text),public.snooze_store_task_for_user(uuid,smallint,date) to service_role;
select cron.schedule('store-task-push','* * * * *',$cron$
 select net.http_post(url:='https://sbsekvjjpxjpdootbsjt.supabase.co/functions/v1/push-notifications',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cron_token),body:='{"action":"tasks-dispatch"}'::jsonb,timeout_milliseconds:=60000)
 from public.push_config where id=1 and enabled and exists(select 1 from public.store_task_settings where enabled);
$cron$);
