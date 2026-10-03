create extension if not exists pgcrypto;
create table if not exists stores(id text primary key,name text not null,address text not null);
insert into stores(id,name,address) values ('163','Видова 163В','Видова 163В'),('190','Видова 190А','Видова 190А') on conflict(id) do nothing;
create table if not exists users(id uuid primary key references auth.users(id) on delete cascade,name text not null,role text not null default 'employee' check(role in ('employee','admin')),store_id text references stores(id),created_at timestamptz default now());
create table if not exists products(id uuid primary key default gen_random_uuid(),barcode text unique not null,name text not null,brand text,created_at timestamptz default now());
create table if not exists expiry_items(id uuid primary key default gen_random_uuid(),product_id uuid not null references products(id),store_id text not null references stores(id),expiry_date date not null,quantity integer not null default 1 check(quantity>0),note text,created_by uuid not null references users(id),updated_by uuid not null references users(id),is_disposed boolean not null default false,disposed_reason text,created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists history(id uuid primary key default gen_random_uuid(),item_id uuid references expiry_items(id) on delete set null,user_id uuid references users(id),action text not null,old_value jsonb,new_value jsonb,created_at timestamptz default now());
create index if not exists expiry_store_date on expiry_items(store_id,expiry_date) where is_disposed=false;
create index if not exists products_barcode on products(barcode);
alter table users enable row level security; alter table stores enable row level security; alter table products enable row level security; alter table expiry_items enable row level security; alter table history enable row level security;
create policy "auth read stores" on stores for select to authenticated using(true);
create policy "auth read products" on products for select to authenticated using(true);
create policy "auth insert products" on products for insert to authenticated with check(true);
create policy "auth read own user" on users for select to authenticated using(id=auth.uid());
create policy "auth insert own user" on users for insert to authenticated with check(id=auth.uid());
create policy "auth update own user" on users for update to authenticated using(id=auth.uid());
create policy "auth read items" on expiry_items for select to authenticated using(true);
create policy "auth insert items" on expiry_items for insert to authenticated with check(created_by=auth.uid());
create policy "auth update items" on expiry_items for update to authenticated using(true) with check(updated_by=auth.uid());
create policy "auth read history" on history for select to authenticated using(true);
alter table expiry_items replica identity full;
alter publication supabase_realtime add table expiry_items;

-- Server-side audit trail and role helpers
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.users where id=auth.uid() and role='admin');
$$;
create or replace function public.audit_expiry_item() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then insert into history(item_id,user_id,action,new_value) values(new.id,new.created_by,'added',to_jsonb(new));
  elsif tg_op='UPDATE' then insert into history(item_id,user_id,action,old_value,new_value) values(new.id,new.updated_by,'updated',to_jsonb(old),to_jsonb(new));
  end if; return new;
end; $$;
drop trigger if exists expiry_audit on expiry_items;
create trigger expiry_audit after insert or update on expiry_items for each row execute function public.audit_expiry_item();

-- Replace broad user policy with team-safe reads and admin management
 drop policy if exists "auth read own user" on users;
create policy "auth read users" on users for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "admin manage users" on users for all to authenticated using(public.is_admin()) with check(public.is_admin() or id=auth.uid());
create policy "admin manage stores" on stores for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin read history" on history for select to authenticated using(public.is_admin() or user_id=auth.uid());
