begin;
-- Network requests queued by pg_net are rolled back too: no test pushes are sent.
select set_config('qa.new_user',gen_random_uuid()::text,true),set_config('qa.admin',(select u.id::text from public.users u join auth.users a on a.id=u.id where u.role='admin' limit 1),true),set_config('qa.device',gen_random_uuid()::text,true),set_config('qa.store','qa-onboard-'||gen_random_uuid()::text,true);
insert into public.stores(id,name,address) values(current_setting('qa.store'),'Учебный магазин регистрации','Учебный');
insert into auth.users(id,email) values(current_setting('qa.new_user')::uuid,current_setting('qa.new_user')||'@example.invalid');
insert into public.push_subscriptions(id,user_id,endpoint,keys) values(current_setting('qa.device')::uuid,current_setting('qa.admin')::uuid,'https://fcm.googleapis.com/qa-'||gen_random_uuid()::text,'{}');
do $$ begin
 if exists(select 1 from public.push_onboarding_events where user_id=current_setting('qa.new_user')::uuid) then raise exception 'Auth signup notified before store selection';end if;
end $$;
insert into public.users(id,name,role) values(current_setting('qa.new_user')::uuid,'Учебный сотрудник','rtz');
do $$ begin
 if exists(select 1 from public.push_onboarding_events where user_id=current_setting('qa.new_user')::uuid) then raise exception 'Incomplete profile notified';end if;
end $$;
update public.users set store_id=current_setting('qa.store') where id=current_setting('qa.new_user')::uuid;
do $$ declare first_request bigint; payload jsonb; begin
 select request_id into first_request from public.push_onboarding_events where user_id=current_setting('qa.new_user')::uuid and user_name='Учебный сотрудник' and store_name='Учебный магазин регистрации' and not is_baseline;
 if first_request is null then raise exception 'No immediate HTTP request after selected store';end if;
 select convert_from(body,'UTF8')::jsonb into payload from net.http_request_queue where id=first_request;
 if payload->>'action'<>'registrations' or payload->>'user_id'<>current_setting('qa.new_user') then raise exception 'Wrong immediate request';end if;
 if (select count(*) from public.push_onboarding_deliveries where user_id=current_setting('qa.new_user')::uuid and subscription_id=current_setting('qa.device')::uuid)<>1 then raise exception 'No device recipient';end if;
 update public.users set name='Исправленное имя',role='srtz' where id=current_setting('qa.new_user')::uuid;
 if (select request_id from public.push_onboarding_events where user_id=current_setting('qa.new_user')::uuid)<>first_request then raise exception 'Repeated profile update notified';end if;
 if not public.claim_onboarding_delivery(current_setting('qa.new_user')::uuid,current_setting('qa.device')::uuid) then raise exception 'Initial claim failed';end if;
 if public.claim_onboarding_delivery(current_setting('qa.new_user')::uuid,current_setting('qa.device')::uuid) then raise exception 'Concurrent claim duplicated';end if;
 update public.push_onboarding_deliveries set state='sent' where user_id=current_setting('qa.new_user')::uuid;
 if public.claim_onboarding_delivery(current_setting('qa.new_user')::uuid,current_setting('qa.device')::uuid) then raise exception 'Delivered event claimed twice';end if;
 if has_function_privilege('authenticated','public.claim_onboarding_delivery(uuid,uuid)','execute') or has_function_privilege('anon','public.claim_onboarding_delivery(uuid,uuid)','execute') then raise exception 'Public event sender';end if;
 if has_table_privilege('authenticated','public.push_onboarding_events','INSERT') or has_table_privilege('anon','public.push_onboarding_events','SELECT') then raise exception 'Public event data';end if;
end $$;
select 'PASS: no event before selected store; immediate post-commit request; one event/device; no repeat on profile/role changes; lease; no public access' as result;
rollback;
