begin;
select set_config('qa.store','qa-task-'||gen_random_uuid()::text,true),set_config('qa.manager',gen_random_uuid()::text,true),set_config('qa.worker',gen_random_uuid()::text,true),set_config('qa.rtz',gen_random_uuid()::text,true),set_config('qa.device',gen_random_uuid()::text,true);
insert into public.stores(id,name,address) values(current_setting('qa.store'),'Тест задач','Учебный');
insert into auth.users(id,email) select current_setting(k)::uuid,current_setting(k)||'@example.invalid' from unnest(array['qa.manager','qa.worker','qa.rtz']) k;
insert into public.users(id,name,role,store_id) values(current_setting('qa.manager')::uuid,'Управляющий тест','manager',current_setting('qa.store')),(current_setting('qa.worker')::uuid,'СРТЗ тест','srtz',current_setting('qa.store')),(current_setting('qa.rtz')::uuid,'РТЗ тест','rtz',current_setting('qa.store'));
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$declare d jsonb;begin
 d:=public.save_store_task_settings(true,public.default_store_task_reminders(),jsonb_build_array(jsonb_build_object('user_id',current_setting('qa.worker'),'start_date',(now() at time zone 'Europe/Moscow')::date)));
 if not (d->>'enabled')::boolean or jsonb_array_length(d->'schedules')<>1 then raise exception 'settings failed';end if;
 begin perform public.save_store_task_settings(true,public.default_store_task_reminders(),jsonb_build_array(jsonb_build_object('user_id',current_setting('qa.rtz'),'start_date',current_date)));raise exception 'RTZ scheduled';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.worker'),true);
do $$declare d jsonb;begin
 d:=public.get_store_task_day();if not (d->>'enabled')::boolean then raise exception 'SRTZ cannot see tasks';end if;
 begin perform public.save_store_task_settings(false,public.default_store_task_reminders(),'[]');raise exception 'SRTZ edited settings';exception when insufficient_privilege then null;end;
 perform public.complete_store_task(1::smallint,(now() at time zone 'Europe/Moscow')::date);
 perform public.complete_store_task(1::smallint,(now() at time zone 'Europe/Moscow')::date);
 if (select count(*) from public.store_task_completions)<>1 then raise exception 'duplicate completion';end if;
 begin perform public.complete_store_task(2::smallint,current_date-1);raise exception 'yesterday completed';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.apply_store_task_push_action(text,text)','execute') then raise exception 'service capability exposed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$begin if jsonb_array_length(public.get_store_task_day()->'completions')<>1 then raise exception 'completion not shared';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.rtz'),true);
do $$begin begin perform public.get_store_task_day();raise exception 'RTZ accessed tasks';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
-- Synthetic device and reminder; never send an HTTP request in this transaction.
insert into public.push_subscriptions(id,user_id,endpoint,keys) values(current_setting('qa.device')::uuid,current_setting('qa.worker')::uuid,'https://fcm.googleapis.com/fcm/send/qa-not-a-device','{"p256dh":"fake","auth":"fake"}');
update public.store_task_settings set reminders=(select jsonb_agg(case when (value->>'task_id')::int=2 then value||jsonb_build_object('enabled',true,'time',to_char(now() at time zone 'Europe/Moscow','HH24:MI')) else value end) from jsonb_array_elements(reminders)) where store_id=current_setting('qa.store');
set local session_replication_role = replica;
update public.store_task_settings set updated_at=now()-interval '1 day' where store_id=current_setting('qa.store');
update public.store_task_schedules set updated_at=now()-interval '1 day' where store_id=current_setting('qa.store');
set local session_replication_role = origin;
set local role service_role;
do $$declare d jsonb; token text; r jsonb;due timestamptz;begin
 if not public.task_workday('2026-11-01','2026-11-01') or not public.task_workday('2026-11-02','2026-11-01') or public.task_workday('2026-11-03','2026-11-01') or public.task_workday('2026-10-31','2026-11-01') then raise exception '2/2 mismatch';end if;
 perform public.prepare_store_task_push();d:=public.claim_next_store_task_push();if d is null then raise exception 'no reminder claim';end if;
 token:=d->>'action_token';
 if public.claim_next_store_task_push() is not null then raise exception 'lease duplicate';end if;
 r:=public.apply_store_task_push_action(token,'snooze');due:=(r->>'next_due_at')::timestamptz;
 if r->>'status'<>'snoozed' or due<clock_timestamp()+interval '9 minutes 59 seconds' then raise exception 'snooze wrong';end if;
 if public.apply_store_task_push_action(token,'snooze')<>r then raise exception 'snooze replay changed';end if;
 -- Next reminder generation rejects off-day actions, then completes using its own capability.
 insert into public.store_task_push_deliveries(notice_id,subscription_id,generation) values((d->>'notice_id')::uuid,current_setting('qa.device')::uuid,1) returning action_token into token;
 update public.store_task_schedules set start_date=(now() at time zone 'Europe/Moscow')::date-2 where store_id=current_setting('qa.store');
 if public.task_notice_allowed((d->>'notice_id')::uuid) then raise exception 'off-day notification allowed';end if;
 begin perform public.apply_store_task_push_action(token,'done');raise exception 'off-day action accepted';exception when insufficient_privilege then null;end;
 update public.store_task_schedules set start_date=(now() at time zone 'Europe/Moscow')::date where store_id=current_setting('qa.store');
 r:=public.apply_store_task_push_action(token,'done');if r->>'status'<>'done' then raise exception 'push done failed';end if;
 if public.apply_store_task_push_action(token,'done')<>r then raise exception 'done replay changed';end if;
 if exists(select 1 from public.store_task_notices where store_id=current_setting('qa.store') and not closed) then raise exception 'completion did not close reminders';end if;
 if public.task_notice_allowed((d->>'notice_id')::uuid) then raise exception 'completed reminder eligible';end if;
end $$;
reset role;
select 'PASS: manager settings, roles, shared completion, idempotence, 2/2, leases, snooze and cancellation' as result;
rollback;
