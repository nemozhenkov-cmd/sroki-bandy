-- Additive, not applied to production until publication. No existing rows/policies changed.
create schema if not exists offline_private;
revoke all on schema offline_private from public,anon;
grant usage on schema offline_private to authenticated;
create table offline_private.receipts (
 owner uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner,operation_id)
);
alter table offline_private.receipts enable row level security;
revoke all on offline_private.receipts from public,anon,authenticated;
grant select,insert on offline_private.receipts to authenticated;
create policy own_receipts_read on offline_private.receipts for select to authenticated using(owner=(select auth.uid()));
create policy own_receipts_insert on offline_private.receipts for insert to authenticated with check(owner=(select auth.uid()));

create function public.sync_offline_operation(operation_id uuid,operation_kind text,item_id uuid,expected jsonb,desired jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor uuid := auth.uid();
 request jsonb := jsonb_build_object('kind',operation_kind,'item_id',item_id,'expected',expected,'desired',desired);
 receipt offline_private.receipts%rowtype;
 current_item public.expiry_items%rowtype;
 product public.products%rowtype;
 output jsonb;
 revision jsonb;
 saved jsonb;
 target_store text := desired->>'store_id';
begin
 if actor is null then raise exception 'Для отправки войдите в приложение'; end if;
 if operation_id is null or item_id is null or operation_kind not in ('add','update','dispose') or operation_kind is null then raise exception 'Некорректная операция'; end if;
 -- Serializes retries even when two tabs/devices deliver the same operation concurrently.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||operation_id::text,0));
 select * into receipt from offline_private.receipts r where r.owner=actor and r.operation_id=$1;
 if found then
  if receipt.request is distinct from request then raise exception 'Идентификатор уже использован другой операцией'; end if;
  return receipt.result;
 end if;
 if not public.can_access_store(target_store) or not exists(select 1 from public.stores s where s.id=target_store and s.is_active) then
  output:=jsonb_build_object('status','rejected','message','Нет доступа к магазину или магазин неактивен. Изменение осталось на телефоне.');
 elsif operation_kind='add' then
  if expected is not null and expected<>'null'::jsonb then raise exception 'Добавление не должно заменять существующую партию'; end if;
  if coalesce(desired->'products'->>'barcode','')!~'^[0-9]+$' or length(trim(coalesce(desired->'products'->>'name','')))=0 then raise exception 'Укажите штрихкод и название'; end if;
  if (desired->>'quantity')::numeric<1 or (desired->>'quantity')::numeric<>trunc((desired->>'quantity')::numeric) then raise exception 'Количество должно быть целым и положительным'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offline-barcode:'||(desired->'products'->>'barcode'),0));
  select * into product from public.products p where p.barcode=desired->'products'->>'barcode';
  if not found then
   insert into public.products(barcode,name,brand) values(desired->'products'->>'barcode',trim(desired->'products'->>'name'),desired->'products'->>'brand') returning * into product;
  end if;
  select * into current_item from public.expiry_items e where e.product_id=product.id and e.store_id=target_store and e.expiry_date=(desired->>'expiry_date')::date and not e.is_disposed for update;
  if found then
   output:=jsonb_build_object('status','conflict','item',to_jsonb(current_item)||jsonb_build_object('products',to_jsonb(product)),'message','Такая партия уже появилась в базе. Проверьте количество перед повторным добавлением.');
  else
   begin
    insert into public.expiry_items(id,product_id,store_id,expiry_date,quantity,note,created_by,updated_by)
     values(item_id,product.id,target_store,(desired->>'expiry_date')::date,(desired->>'quantity')::integer,desired->>'note',actor,actor) returning * into current_item;
   exception when unique_violation then
    output:=jsonb_build_object('status','conflict','message','Партия появилась в базе одновременно с отправкой. Обновите данные и проверьте количество.');
   end;
  end if;
 else
  select * into current_item from public.expiry_items e where e.id=item_id for update;
  if not found then
   output:=jsonb_build_object('status','rejected','message','Партия недоступна или удалена. Ваше изменение осталось на телефоне.');
  elsif not public.can_access_store(current_item.store_id) then
   output:=jsonb_build_object('status','rejected','message','Нет доступа к исходному магазину.');
  else
   revision:=jsonb_build_object('product_id',current_item.product_id,'store_id',current_item.store_id,'expiry_date',current_item.expiry_date,'quantity',current_item.quantity,'note',current_item.note,'is_disposed',current_item.is_disposed,'updated_at',current_item.updated_at);
   -- Normalize timestamptz representation; JS/JSON may use Z instead of +00:00.
   if expected is not null and expected->>'updated_at' is not null then
    expected:=jsonb_set(expected,'{updated_at}',to_jsonb((expected->>'updated_at')::timestamptz));
   end if;
   if current_item.is_disposed or revision is distinct from expected then
    select * into product from public.products p where p.id=current_item.product_id;
    output:=jsonb_build_object('status','conflict','item',to_jsonb(current_item)||jsonb_build_object('products',to_jsonb(product)),'message','Другой сотрудник уже изменил эту партию. Автоматическая замена остановлена.');
   else
    if operation_kind='update' and ((desired->>'quantity')::numeric<1 or (desired->>'quantity')::numeric<>trunc((desired->>'quantity')::numeric)) then raise exception 'Количество должно быть целым и положительным'; end if;
    begin
     update public.expiry_items e set
      expiry_date=case when operation_kind='dispose' then e.expiry_date else (desired->>'expiry_date')::date end,
      quantity=case when operation_kind='dispose' then e.quantity else (desired->>'quantity')::integer end,
      store_id=case when operation_kind='dispose' then e.store_id else target_store end,
      note=case when operation_kind='dispose' then e.note else desired->>'note' end,
      is_disposed=(operation_kind='dispose'),updated_by=actor,updated_at=clock_timestamp()
     where e.id=item_id returning * into current_item;
    exception when unique_violation then
     output:=jsonb_build_object('status','conflict','message','В базе уже есть партия с такой датой. Проверьте обе записи.');
    end;
   end if;
  end if;
 end if;
 if output is null then
  select * into product from public.products p where p.id=current_item.product_id;
  saved:=to_jsonb(current_item)||jsonb_build_object('products',to_jsonb(product),'stores',(select to_jsonb(s) from public.stores s where s.id=current_item.store_id));
  output:=jsonb_build_object('status','applied','item',saved);
 end if;
 insert into offline_private.receipts(owner,operation_id,request,result) values(actor,operation_id,request,output);
 return output;
end;
$$;
revoke all on function public.sync_offline_operation(uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.sync_offline_operation(uuid,text,uuid,jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
