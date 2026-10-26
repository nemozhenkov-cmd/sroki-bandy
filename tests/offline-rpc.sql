-- Run after the migration inside BEGIN ... ROLLBACK. Uses synthetic rows only.
select set_config('request.jwt.claim.sub',(select id::text from public.users where role='admin' limit 1),true);
set local role authenticated;
do $$
declare
 store text; op uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
 desired jsonb; first_result jsonb; second_result jsonb; current_result jsonb; baseline jsonb; current_revision jsonb;
 n integer;
begin
 select id into store from public.stores where is_active and public.can_access_store(id) limit 1;
 if store is null then raise exception 'No authorized test store'; end if;
 desired:=jsonb_build_object('store_id',store,'expiry_date',(current_date+20)::text,'quantity',7,'note','OFFLINE ROLLBACK TEST','products',jsonb_build_object('barcode','999'||extract(epoch from clock_timestamp())::bigint::text,'name','OFFLINE ROLLBACK TEST','brand','TEST'));
 first_result:=public.sync_offline_operation(op,'add',item,null,desired);
 if first_result->>'status'<>'applied' then raise exception 'Add failed: %',first_result; end if;
 second_result:=public.sync_offline_operation(op,'add',item,null,desired);
 if first_result is distinct from second_result then raise exception 'Retry changed result'; end if;
 select count(*) into n from public.history where item_id=item;
 if n<>1 then raise exception 'Retry duplicated audit history: %',n; end if;
 begin
  perform public.sync_offline_operation(op,'add',item,null,desired||'{"quantity":8}'::jsonb);
  raise exception 'Expected operation ID reuse rejection';
 exception when others then
  if sqlerrm not like '%Идентификатор уже использован%' then raise; end if;
 end;
 select jsonb_object_agg(key,value) into baseline from jsonb_each(first_result->'item') where key=any(array['product_id','store_id','expiry_date','quantity','note','is_disposed','updated_at']);
 current_result:=public.sync_offline_operation(gen_random_uuid(),'update',item,baseline,desired||'{"quantity":9}'::jsonb);
 if current_result->>'status'<>'applied' or current_result->'item'->>'quantity'<>'9' then raise exception 'Update failed: %',current_result; end if;
 second_result:=public.sync_offline_operation(gen_random_uuid(),'dispose',item,baseline,desired);
 if second_result->>'status'<>'conflict' then raise exception 'Stale write not blocked'; end if;
 if (select is_disposed from public.expiry_items where id=item) then raise exception 'Conflict disposed item'; end if;
 select jsonb_object_agg(key,value) into current_revision from jsonb_each(current_result->'item') where key=any(array['product_id','store_id','expiry_date','quantity','note','is_disposed','updated_at']);
 second_result:=public.sync_offline_operation(gen_random_uuid(),'dispose',item,current_revision,desired);
 if second_result->>'status'<>'applied' or second_result->'item'->>'is_disposed'<>'true' then raise exception 'Dispose failed'; end if;
 second_result:=public.sync_offline_operation(gen_random_uuid(),'add',gen_random_uuid(),null,desired||'{"store_id":"__no_access_test__"}'::jsonb);
 if second_result->>'status'<>'rejected' then raise exception 'Store authorization failed'; end if;
 second_result:=public.sync_offline_operation(gen_random_uuid(),'add',gen_random_uuid(),null,desired);
 if second_result->>'status'<>'applied' then raise exception 'New active batch after disposal failed: %',second_result; end if;
 second_result:=public.sync_offline_operation(gen_random_uuid(),'add',gen_random_uuid(),null,desired);
 if second_result->>'status'<>'conflict' then raise exception 'Duplicate batch not detected'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.sync_offline_operation(gen_random_uuid(),'add',gen_random_uuid(),null,desired);
  raise exception 'Expected authentication failure';
 exception when others then
  if sqlerrm not like '%Для отправки войдите%' then raise; end if;
 end;
end $$;
reset role;
