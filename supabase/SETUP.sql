-- supabase/SETUP.sql
-- Conexão Street (PRO) — setup idempotente
-- ✅ Rode este arquivo no Supabase SQL Editor.

-- Extensions (Supabase normalmente já tem, mas garantimos)
create extension if not exists pgcrypto;

-- ====== TABELAS ======
create table if not exists public.cs_admins (
  user_id uuid primary key,
  created_at timestamptz default now()
);

create table if not exists public.cs_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  product_id text not null,             -- 'vip' | 'final' (bate com cs_links.kind)
  status text not null default 'pending',-- 'pending' | 'approved' | 'rejected'
  buyer_name text,
  buyer_email text,
  user_id uuid                          -- auth.uid() quando logado
);
create index if not exists cs_orders_user_idx on public.cs_orders(user_id);
create index if not exists cs_orders_status_idx on public.cs_orders(status);

create table if not exists public.cs_user_devices (
  user_id uuid primary key,
  device_id text not null,
  updated_at timestamptz default now()
);

create table if not exists public.cs_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  kind text not null, -- 'vip' | 'final'
  title text not null,
  url text not null,
  note text,
  active boolean not null default true,
  sort int not null default 999
);

-- ====== RLS ======
alter table public.cs_admins enable row level security;
alter table public.cs_orders enable row level security;
alter table public.cs_user_devices enable row level security;
alter table public.cs_links enable row level security;

-- ====== POLICIES ======
drop policy if exists "admins read self" on public.cs_admins;
create policy "admins read self" on public.cs_admins
for select to authenticated
using (auth.uid() = user_id);

-- pedidos: inserir (anon/auth) — só pra registrar pagamento
drop policy if exists "orders insert" on public.cs_orders;
create policy "orders insert" on public.cs_orders
for insert to anon, authenticated
with check (true);

-- pedidos: usuário logado vê os próprios
drop policy if exists "orders read own" on public.cs_orders;
create policy "orders read own" on public.cs_orders
for select to authenticated
using (user_id = auth.uid());

-- pedidos: admin vê tudo / atualiza status
drop policy if exists "orders admin read" on public.cs_orders;
create policy "orders admin read" on public.cs_orders
for select to authenticated
using (exists(select 1 from public.cs_admins a where a.user_id = auth.uid()));

drop policy if exists "orders admin update" on public.cs_orders;
create policy "orders admin update" on public.cs_orders
for update to authenticated
using (exists(select 1 from public.cs_admins a where a.user_id = auth.uid()))
with check (exists(select 1 from public.cs_admins a where a.user_id = auth.uid()));

-- 1 dispositivo por usuário (cada um só mexe no seu)
drop policy if exists "devices self rw" on public.cs_user_devices;
create policy "devices self rw" on public.cs_user_devices
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- links: admin gerencia
drop policy if exists "links admin rw" on public.cs_links;
create policy "links admin rw" on public.cs_links
for all to authenticated
using (exists(select 1 from public.cs_admins a where a.user_id = auth.uid()))
with check (exists(select 1 from public.cs_admins a where a.user_id = auth.uid()));

-- links: usuário logado só lê se tiver pedido aprovado do produto correspondente
drop policy if exists "links approved read" on public.cs_links;
create policy "links approved read" on public.cs_links
for select to authenticated
using (
  exists(
    select 1 from public.cs_orders o
    where o.user_id = auth.uid()
      and o.status = 'approved'
      and o.product_id = cs_links.kind
  )
);

-- ====== GRANTS (sem isso, dá erro de permissão / falha ao criar pedido) ======
revoke all on public.cs_admins from anon, authenticated;
revoke all on public.cs_orders from anon, authenticated;
revoke all on public.cs_user_devices from anon, authenticated;
revoke all on public.cs_links from anon, authenticated;

-- anon: só consegue inserir pedido (checkout)
grant insert on public.cs_orders to anon;

-- authenticated: app precisa ler/escrever o necessário (RLS segura o resto)
grant select, insert on public.cs_orders to authenticated;
grant update on public.cs_orders to authenticated; -- só admin passa na policy

grant select on public.cs_admins to authenticated;
grant select, insert, update, delete on public.cs_user_devices to authenticated;

grant select on public.cs_links to authenticated;
grant insert, update, delete on public.cs_links to authenticated; -- só admin passa na policy

-- Se der algum erro por "permission denied for schema public":
-- grant usage on schema public to anon, authenticated;

-- Depois que você criar sua conta (member.html), pegue seu auth.uid() em Authentication → Users
-- e rode:
-- insert into public.cs_admins (user_id) values ('SEU_USER_UUID_AQUI') on conflict do nothing;

-- device bind (1 dispositivo)
grant select, insert, update on public.cs_user_devices to authenticated;
