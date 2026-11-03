-- Read-only reporting. Existing history/item/user RLS remains authoritative.
create index if not exists history_created_cursor_idx on public.history(created_at desc,id desc);
create index if not exists history_item_id_idx on public.history(item_id);

create function public.work_history_rows(p_from date,p_to date,p_store text default null)
returns table(id uuid,created_at timestamptz,user_id uuid,user_name text,action text,store_id text,store_name text,product_name text,expiry_before text,expiry_after text,quantity_before bigint,quantity_after bigint,disposed_quantity bigint,note text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.users where users.id=auth.uid()) then raise exception 'Требуется профиль пользователя' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 then raise exception 'Выберите период до 366 дней';end if;
 if p_store is not null and not public.can_access_store(p_store) then raise exception 'Нет доступа к магазину' using errcode='42501';end if;
 return query
 select h.id,h.created_at,h.user_id,coalesce(u.name,'Сотрудник'),case when h.action='edited' then 'updated' else h.action end,
 coalesce(h.new_value->>'store_id',h.old_value->>'store_id',ei.store_id),coalesce(s.name,'Магазин'),coalesce(p.name,'Товар'),h.old_value->>'expiry_date',h.new_value->>'expiry_date',
 case when coalesce(h.old_value->>'quantity','')~'^[1-9][0-9]{0,9}$' then (h.old_value->>'quantity')::bigint end,
 case when coalesce(h.new_value->>'quantity','')~'^[1-9][0-9]{0,9}$' then (h.new_value->>'quantity')::bigint end,
 case when h.action='disposed' then case when coalesce(h.old_value->>'quantity','')~'^[1-9][0-9]{0,9}$' then (h.old_value->>'quantity')::bigint when coalesce(h.new_value->>'quantity','')~'^[1-9][0-9]{0,9}$' then (h.new_value->>'quantity')::bigint end end,
 coalesce(h.new_value->>'note',h.old_value->>'note')
 from public.history h join public.expiry_items ei on ei.id=h.item_id left join public.users u on u.id=h.user_id left join public.products p on p.id=ei.product_id left join public.stores s on s.id=coalesce(h.new_value->>'store_id',h.old_value->>'store_id',ei.store_id)
 where h.created_at>=(p_from::timestamp at time zone 'Europe/Moscow') and h.created_at<((p_to+1)::timestamp at time zone 'Europe/Moscow')
 and h.action in ('added','updated','edited','disposed')
 and (p_store is null or coalesce(h.new_value->>'store_id',h.old_value->>'store_id',ei.store_id)=p_store);
end;$$;

create function public.get_work_statistics(p_from date,p_to date,p_store text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 with base as materialized(select * from public.work_history_rows(p_from,p_to,p_store)),
 totals as(select count(*) filter(where action='added') added,count(*) filter(where action='updated') updated,count(*) filter(where action='disposed') disposed,coalesce(sum(disposed_quantity),0) disposed_units,count(*) filter(where action='disposed' and disposed_quantity is null) unknown_units from base),
 actors as(select coalesce(user_id::text,'unknown') actor_id,max(user_name) name,count(*) filter(where action='added') added,count(*) filter(where action='updated') updated,count(*) filter(where action='disposed') disposed,coalesce(sum(disposed_quantity),0) disposed_units,count(*) filter(where action='disposed' and disposed_quantity is null) unknown_units,max(created_at) last_action_at from base group by user_id),
 members as(select u.id::text actor_id,u.name from public.users u where (p_store is null or u.store_id=p_store) and (u.role in ('rtz','srtz','srtz_rtz','manager') or exists(select 1 from actors a where a.actor_id=u.id::text))),
 team as(select coalesce(a.actor_id,m.actor_id) actor_id,coalesce(m.name,a.name) name,coalesce(a.added,0) added,coalesce(a.updated,0) updated,coalesce(a.disposed,0) disposed,coalesce(a.disposed_units,0) disposed_units,coalesce(a.unknown_units,0) unknown_units,a.last_action_at,ua.last_seen_at from actors a full join members m using(actor_id) left join public.user_activity ua on ua.user_id::text=coalesce(a.actor_id,m.actor_id))
 select jsonb_build_object('totals',(select to_jsonb(t) from totals t),'employees',coalesce((select jsonb_agg(to_jsonb(t) order by t.name,t.actor_id) from team t),'[]'::jsonb),'updated_at',now());
$$;

create function public.get_work_history(p_from date,p_to date,p_store text default null,p_user text default null,p_action text default null,p_search text default '',p_before_at timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_action is not null and p_action not in ('added','updated','disposed') then raise exception 'Проверьте тип действия';end if;
 if length(coalesce(p_search,''))>120 or (p_before_at is null)<>(p_before_id is null) then raise exception 'Проверьте фильтры истории';end if;
 with page as materialized(
 select b.* from public.work_history_rows(p_from,p_to,p_store) b
 where (p_user is null or coalesce(b.user_id::text,'unknown')=p_user) and (p_action is null or b.action=p_action)
 and (coalesce(trim(p_search),'')='' or position(lower(trim(p_search)) in lower(b.product_name))>0)
 and (p_before_at is null or (b.created_at,b.id)<(p_before_at,p_before_id))
 order by b.created_at desc,b.id desc limit 51),
 numbered as(select p.*,row_number() over(order by p.created_at desc,p.id desc) position from page p)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(n)-'position' order by n.created_at desc,n.id desc) filter(where position<=50),'[]'::jsonb),'has_more',count(*)>50,'updated_at',now()) into result from numbered n;
 return result;
end;$$;
revoke all on function public.work_history_rows(date,date,text),public.get_work_statistics(date,date,text),public.get_work_history(date,date,text,text,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.work_history_rows(date,date,text),public.get_work_statistics(date,date,text),public.get_work_history(date,date,text,text,text,text,timestamptz,uuid) to authenticated;
