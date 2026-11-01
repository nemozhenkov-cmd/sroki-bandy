CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id uuid, p_role text, p_store_id text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result_user public.users;
begin
  if not public.is_admin() then
    raise exception 'Только администратор может изменять сотрудников';
  end if;

  if p_role not in ('tm', 'manager', 'srtz_rtz', 'rtz', 'srtz') then
    raise exception 'Недопустимая роль';
  end if;

  if p_role = 'tm' and p_store_id is not null then
    raise exception 'ТМ не должен быть привязан к магазину';
  end if;

  if p_role in ('manager', 'srtz_rtz', 'rtz', 'srtz') and p_store_id is null then
    raise exception 'Для этой роли необходимо указать магазин';
  end if;

  if not exists (
    select 1
    from public.stores
    where id = p_store_id
      and is_active = true
  ) and p_role in ('manager', 'srtz_rtz', 'rtz', 'srtz') then
    raise exception 'Можно назначить только активный магазин';
  end if;

  update public.users
  set
    role = p_role,
    store_id = p_store_id
  where id = p_user_id
    and role <> 'admin'
  returning * into result_user;

  if result_user.id is null then
    raise exception 'Пользователь не найден или защищён';
  end if;

  return result_user;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_admin()
    or public.is_tm()
    or (
      exists (
        select 1
        from public.users
        where id = auth.uid()
          and role in ('manager', 'srtz_rtz', 'rtz', 'srtz')
          and store_id = p_store_id
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_store_recommendations()
 RETURNS TABLE(product_name text, brand text, expiry_date date, store_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.name as product_name,
    coalesce(p.brand, '') as brand,
    ei.expiry_date,
    array_agg(distinct s.name order by s.name) as store_names
  from public.expiry_items ei
  join public.products p
    on p.id = ei.product_id
  join public.stores s
    on s.id = ei.store_id
  where
    ei.is_disposed = false
    and s.is_active = true
    and ei.expiry_date >= current_date
    and ei.expiry_date <= current_date + 7
    and ei.store_id <> (
      select u.store_id
      from public.users u
      where u.id = auth.uid()
    )
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('manager', 'srtz_rtz', 'rtz', 'srtz')
    )
  group by
    p.id,
    p.name,
    p.brand,
    ei.expiry_date
  order by
    ei.expiry_date,
    p.name;
$function$;

-- Keep legacy literal accepted while old installed clients are updating.
alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check check (role in ('admin','tm','manager','srtz_rtz','rtz','srtz'));
alter table public.users alter column role set default 'rtz';

create or replace function public.protect_user_role_and_store()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor public.users; trusted boolean;
begin
 trusted := auth.uid() is null and coalesce(current_setting('role',true),'none') in ('none','postgres','service_role');
 if trusted or public.is_admin() then return new; end if;
 select * into actor from public.users where id=auth.uid();
 if actor.id is null then raise exception 'Профиль не найден' using errcode='42501'; end if;
 if new.role is distinct from old.role then
   if not (actor.role='manager' and actor.id<>old.id
     and actor.store_id=old.store_id and new.store_id=old.store_id
     and old.role in ('rtz','srtz','srtz_rtz') and new.role in ('rtz','srtz')
     and exists(select 1 from public.stores s where s.id=actor.store_id and s.is_active)
     and (to_jsonb(new)-'role')=(to_jsonb(old)-'role')) then
     raise exception 'Управляющий может назначать только РТЗ и СРТЗ сотрудникам своего магазина' using errcode='42501';
   end if;
 end if;
 if new.store_id is distinct from old.store_id then
   raise exception 'Изменять магазин через профиль нельзя' using errcode='42501';
 end if;
 -- Other people's data can only be changed by the narrow role transition above.
 if actor.id is distinct from old.id and
    not (actor.role='manager' and actor.store_id=old.store_id and new.role is distinct from old.role
      and (to_jsonb(new)-'role')=(to_jsonb(old)-'role')) then
   raise exception 'Нельзя изменять чужой профиль' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function public.protect_user_role_and_store() from public,anon,authenticated;

create or replace function public.default_staff_role()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(current_setting('role',true),'none') in ('anon','authenticated') then
   if auth.uid() is null or new.id<>auth.uid() then raise exception 'Требуется свой аккаунт' using errcode='42501'; end if;
   if new.role='srtz_rtz' then new.role:='rtz'; end if;
   if new.role is distinct from 'rtz' then raise exception 'Новый сотрудник получает роль РТЗ' using errcode='42501'; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.default_staff_role() from public,anon,authenticated;
create trigger default_staff_role_trigger before insert on public.users for each row execute function public.default_staff_role();

create policy manager_update_staff_role on public.users for update to authenticated
 using(public.is_manager() and id<>auth.uid() and store_id=public.current_user_store_id() and role in ('rtz','srtz','srtz_rtz'))
 with check(public.is_manager() and id<>auth.uid() and store_id=public.current_user_store_id() and role in ('rtz','srtz'));

create function public.manager_set_staff_role(p_user_id uuid,p_role text)
returns public.users language plpgsql security invoker set search_path='' as $$
declare actor public.users; target public.users; result_user public.users;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 select * into actor from public.users where id=auth.uid() for share;
 if actor.role is distinct from 'manager' then raise exception 'Только управляющий назначает СРТЗ' using errcode='42501'; end if;
 if p_role is null or p_role not in ('rtz','srtz') then raise exception 'Можно выбрать только РТЗ или СРТЗ' using errcode='42501'; end if;
 select * into target from public.users where id=p_user_id;
 if target.id is null or target.id=actor.id or target.store_id is distinct from actor.store_id or target.role not in ('rtz','srtz','srtz_rtz') then
   raise exception 'Можно изменить только сотрудника своего магазина' using errcode='42501';
 end if;
 if not exists(select 1 from public.stores where id=actor.store_id and is_active) then raise exception 'Магазин неактивен' using errcode='42501'; end if;
 if target.role=p_role then return target; end if;
 update public.users set role=p_role where id=target.id returning * into result_user;
 if result_user.id is null then raise exception 'Недостаточно прав' using errcode='42501'; end if;
 return result_user;
end;
$$;
revoke all on function public.manager_set_staff_role(uuid,text) from public,anon;
grant execute on function public.manager_set_staff_role(uuid,text) to authenticated;
-- A combined role never proved seniority. Managers select actual seniors afterwards.
update public.users set role='rtz' where role='srtz_rtz';
