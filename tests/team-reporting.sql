begin;
select set_config('qa.store','qa-team-'||gen_random_uuid()::text,true),set_config('qa.foreign_store','qa-team-'||gen_random_uuid()::text,true),set_config('qa.manager',gen_random_uuid()::text,true),set_config('qa.worker',gen_random_uuid()::text,true),set_config('qa.foreign',gen_random_uuid()::text,true),set_config('qa.product',gen_random_uuid()::text,true),set_config('qa.item',gen_random_uuid()::text,true),set_config('qa.foreign_item',gen_random_uuid()::text,true);
insert into public.stores(id,name,address) values(current_setting('qa.store'),'Команда тест','Учебный'),(current_setting('qa.foreign_store'),'Чужой тест','Учебный');
insert into auth.users(id,email) select current_setting(k)::uuid,current_setting(k)||'@example.invalid' from unnest(array['qa.manager','qa.worker','qa.foreign'])k;
insert into public.users(id,name,role,store_id) values(current_setting('qa.manager')::uuid,'Управляющий тест','manager',current_setting('qa.store')),(current_setting('qa.worker')::uuid,'Сотрудник тест','srtz',current_setting('qa.store')),(current_setting('qa.foreign')::uuid,'Чужой тест','rtz',current_setting('qa.foreign_store'));
insert into public.products(id,barcode,name) values(current_setting('qa.product')::uuid,'qa-'||gen_random_uuid()::text,'Товар тест 100%');
insert into public.expiry_items(id,product_id,store_id,expiry_date,quantity,created_by,updated_by) values(current_setting('qa.item')::uuid,current_setting('qa.product')::uuid,current_setting('qa.store'),current_date+10,777,current_setting('qa.worker')::uuid,current_setting('qa.worker')::uuid),(current_setting('qa.foreign_item')::uuid,current_setting('qa.product')::uuid,current_setting('qa.foreign_store'),current_date+10,1,current_setting('qa.foreign')::uuid,current_setting('qa.foreign')::uuid);
insert into public.history(item_id,user_id,action,created_at,old_value,new_value)
select current_setting('qa.item')::uuid,current_setting('qa.worker')::uuid,'updated','2025-01-02 09:00:00+03',jsonb_build_object('quantity',2,'store_id',current_setting('qa.store')),jsonb_build_object('quantity',3,'store_id',current_setting('qa.store')) from generate_series(1,1005);
insert into public.history(item_id,user_id,action,created_at,old_value,new_value) values
(current_setting('qa.item')::uuid,current_setting('qa.worker')::uuid,'disposed','2025-01-02 23:59:59+03',jsonb_build_object('quantity',18),jsonb_build_object('quantity',18,'store_id',current_setting('qa.store'))),
(current_setting('qa.item')::uuid,current_setting('qa.worker')::uuid,'disposed','2025-01-02 00:00:00+03','{}',jsonb_build_object('store_id',current_setting('qa.store'))),
(current_setting('qa.item')::uuid,current_setting('qa.worker')::uuid,'added','2025-01-03 00:00:00+03','{}',jsonb_build_object('quantity',9,'store_id',current_setting('qa.store'))),
(current_setting('qa.foreign_item')::uuid,current_setting('qa.foreign')::uuid,'disposed','2025-01-02 12:00:00+03',jsonb_build_object('quantity',999),jsonb_build_object('quantity',999,'store_id',current_setting('qa.foreign_store')));
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$declare s jsonb;p jsonb;last jsonb;seen uuid[]:='{}';r jsonb; n int:=0;begin
 s:=public.get_work_statistics('2025-01-02','2025-01-02',current_setting('qa.store'));
 if (s->'totals'->>'updated')::int<>1005 or (s->'totals'->>'disposed')::int<>2 or (s->'totals'->>'added')::int<>0 or (s->'totals'->>'disposed_units')::int<>18 or (s->'totals'->>'unknown_units')::int<>1 then raise exception 'incorrect aggregates, cap, scope or snapshot units: %',s->'totals';end if;
 if jsonb_array_length(s->'employees')<>2 then raise exception 'team scope failed';end if;
 p:=public.get_work_history('2025-01-02','2025-01-02',current_setting('qa.store'),current_setting('qa.worker'),'disposed','100%');
 if jsonb_array_length(p->'rows')<>2 then raise exception 'literal search/action/employee filters failed';end if;
 loop
  p:=public.get_work_history('2025-01-02','2025-01-02',current_setting('qa.store'),null,'updated','',case when last is null then null else (last->>'created_at')::timestamptz end,case when last is null then null else (last->>'id')::uuid end);
  for r in select value from jsonb_array_elements(p->'rows') loop
   if (r->>'id')::uuid=any(seen) then raise exception 'duplicate pagination row';end if;
   seen:=array_append(seen,(r->>'id')::uuid);n:=n+1;last:=r;
  end loop;
  exit when not (p->>'has_more')::boolean;
 end loop;
 if n<>1005 then raise exception 'pagination lost rows: %',n;end if;
 begin perform public.get_work_statistics('2025-01-02','2025-01-02',current_setting('qa.foreign_store'));raise exception 'foreign store allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_work_statistics('2025-01-03','2025-01-02',null);raise exception 'reversed dates allowed';exception when raise_exception then if sqlerrm='reversed dates allowed' then raise;end if;end;
 s:=public.get_work_statistics('2025-01-02','2025-01-02',null);if (s->'totals'->>'disposed')::int<>2 then raise exception 'all leaks foreign records';end if;
end $$;
reset role;
select 'PASS: full aggregation beyond 1000, updated actions, Moscow inclusive dates, historical units, unknown quantities, stable pagination and store isolation' result;
rollback;
