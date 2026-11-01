begin;
-- Ephemeral users/stores; every change is rolled back, including successful assignments.
select set_config('qa.store_a','qa-role-'||gen_random_uuid()::text,true),set_config('qa.store_b','qa-role-'||gen_random_uuid()::text,true);
select set_config('qa.manager',gen_random_uuid()::text,true),set_config('qa.worker',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),set_config('qa.signup',gen_random_uuid()::text,true);
insert into public.stores(id,name,address) values(current_setting('qa.store_a'),'Тест ролей А','Учебный'),(current_setting('qa.store_b'),'Тест ролей Б','Учебный');
insert into auth.users(id,email) select current_setting(k)::uuid,current_setting(k)||'@example.invalid' from unnest(array['qa.manager','qa.worker','qa.other','qa.signup']) k;
insert into public.users(id,name,role,store_id) values
(current_setting('qa.manager')::uuid,'Тест управляющего','manager',current_setting('qa.store_a')),
(current_setting('qa.worker')::uuid,'Тест сотрудника','rtz',current_setting('qa.store_a')),
(current_setting('qa.other')::uuid,'Чужой сотрудник','rtz',current_setting('qa.store_b'));
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$
begin
 perform public.manager_set_staff_role(current_setting('qa.worker')::uuid,'srtz');
 if (select role from public.users where id=current_setting('qa.worker')::uuid)<>'srtz' then raise exception 'promotion failed';end if;
 perform public.manager_set_staff_role(current_setting('qa.worker')::uuid,'rtz');
 begin update public.users set role='manager' where id=current_setting('qa.worker')::uuid;raise exception 'direct elevation allowed';exception when insufficient_privilege then null;end;
 begin perform public.manager_set_staff_role(current_setting('qa.other')::uuid,'srtz');raise exception 'foreign store allowed';exception when insufficient_privilege then null;end;
 begin perform public.manager_set_staff_role(current_setting('qa.worker')::uuid,'manager');raise exception 'manager grant allowed';exception when insufficient_privilege then null;end;
 begin perform public.manager_set_staff_role(current_setting('qa.manager')::uuid,'srtz');raise exception 'self role allowed';exception when insufficient_privilege then null;end;
 begin update public.users set name='Forbidden' where id=current_setting('qa.worker')::uuid;raise exception 'name edit allowed';exception when insufficient_privilege then null;end;
 begin update public.users set store_id=current_setting('qa.store_b') where id=current_setting('qa.worker')::uuid;raise exception 'store transfer allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.worker'),true);
do $$
begin
 if not public.can_access_store(current_setting('qa.store_a')) then raise exception 'RTZ lost access';end if;
 if public.can_access_store(current_setting('qa.store_b')) then raise exception 'RTZ gained other store';end if;
 begin perform public.manager_set_staff_role(current_setting('qa.worker')::uuid,'srtz');raise exception 'worker can promote';exception when insufficient_privilege then null;end;
 begin update public.users set role='srtz' where id=auth.uid();raise exception 'self promotion allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.signup'),true);
do $$
begin
 begin insert into public.users(id,name,role,store_id) values(auth.uid(),'Тест','srtz',current_setting('qa.store_a'));raise exception 'signup senior allowed';exception when insufficient_privilege then null;end;
 begin insert into public.users(id,name,role,store_id) values(auth.uid(),'Тест','admin',current_setting('qa.store_a'));raise exception 'signup admin allowed';exception when insufficient_privilege then null;end;
 insert into public.users(id,name,role,store_id) values(auth.uid(),'Старый клиент','srtz_rtz',current_setting('qa.store_a'));
 if (select role from public.users where id=auth.uid())<>'rtz' then raise exception 'legacy signup not normalized';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select 'PASS: manager scope, promotion, demotion, no privilege escalation, safe registration, legacy compatibility, store access' as result;
rollback;
