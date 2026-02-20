-- Conexão Street — Supabase schema (compatível com o site deste repositório)
-- Atualizado para bater com os arquivos:
--   js/ui.js, js/checkout.js, js/pagamento.js, js/member.js, js/admin.js, js/admin_p.js, js/vault.js
--
-- Requisitos:
--  - Extensão pgcrypto (gen_random_uuid)
--  - RLS habilitado

-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- HELPERS (ADMIN)
-- =========================
create table if not exists public.cs_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

-- Retorna true se o usuário logado for admin
create or replace function public.cs_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.cs_admins a where a.user_id = auth.uid()
  );
$$;

-- Faz um usuário virar (ou deixar de ser) admin pelo e-mail
create or replace function public.cs_admin_set_by_email(p_email text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
begin
  if not public.cs_is_admin() then
    raise exception 'not_admin';
  end if;

  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;

  if v_uid is null then
    raise exception 'user_not_found';
  end if;

  if p_on then
    insert into public.cs_admins(user_id) values (v_uid)
    on conflict do nothing;
  else
    delete from public.cs_admins where user_id = v_uid;
  end if;

  return true;
end;
$$;

-- Desvincula dispositivo (libera troca de celular)
create table if not exists public.cs_user_devices (
  user_id uuid primary key,
  device_id text not null,
  device_meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.cs_device_unlock_by_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
begin
  if not public.cs_is_admin() then
    raise exception 'not_admin';
  end if;

  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;

  if v_uid is null then
    raise exception 'user_not_found';
  end if;

  delete from public.cs_user_devices where user_id = v_uid;
  return true;
end;
$$;

-- =========================
-- ORDERS
-- =========================
create table if not exists public.cs_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- vínculo opcional com auth.users (quando o checkout está logado)
  user_id uuid null,

  buyer_name text,
  buyer_email text,
  buyer_phone text,

  product_id text not null,
  product_name text,

  amount_cents integer not null default 0,
  amount numeric,
  currency text not null default 'BRL',

  payment_status text not null default 'PENDENTE', -- PENDENTE | PAGO
  order_status text not null default 'CRIADO',     -- CRIADO | APROVADO
  status text not null default 'pending',          -- pending | approved (compat)

  provider text,
  provider_ref text,

  paid_at timestamptz,

  approved_at timestamptz,
  approved_by uuid,

  notes text,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists cs_orders_user_id_idx on public.cs_orders(user_id);
create index if not exists cs_orders_buyer_email_idx on public.cs_orders(lower(buyer_email));
create index if not exists cs_orders_product_id_idx on public.cs_orders(product_id);
create index if not exists cs_orders_created_at_idx on public.cs_orders(created_at desc);

-- =========================
-- CATALOG / CONTENT (ADMIN)
-- =========================
create table if not exists public.cs_products (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  product_id text unique not null,
  name text not null,
  price_cents integer not null default 0,
  image_url text,
  is_active boolean not null default true
);

create table if not exists public.cs_providers (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  name text not null,
  subtitle text,
  link text not null,
  image_url text,
  is_active boolean not null default true
);

create table if not exists public.cs_links (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null, -- vip | final
  title text not null,
  url text not null,
  subtitle text,
  category text,
  sort integer not null default 0,
  is_active boolean not null default true
);

create index if not exists cs_links_kind_sort_idx on public.cs_links(kind, sort);

create table if not exists public.cs_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =========================
-- LOGS
-- =========================
create table if not exists public.cs_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event_type text not null,
  user_id uuid,
  user_email text,
  page text,
  ua text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists cs_logs_created_at_idx on public.cs_logs(created_at desc);

-- =========================
-- ACCESS HELPERS
-- =========================
create or replace function public.cs_has_access(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select auth.uid() as uid,
           lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select exists(
    select 1
    from public.cs_orders o, u
    where (
      (o.user_id = u.uid) or (lower(coalesce(o.buyer_email,'')) = u.email)
    )
    and (
      lower(coalesce(o.order_status, o.status, '')) ~ 'aprovado|approved'
    )
    and (
      case lower(coalesce(p_kind,''))
        when 'vip' then lower(o.product_id) in ('vip','lojista','css-importados')
        when 'final' then lower(o.product_id) = 'final'
        else false
      end
    )
  );
$$;

-- =========================
-- RLS
-- =========================
alter table public.cs_admins enable row level security;
alter table public.cs_user_devices enable row level security;
alter table public.cs_orders enable row level security;
alter table public.cs_products enable row level security;
alter table public.cs_providers enable row level security;
alter table public.cs_links enable row level security;
alter table public.cs_site_settings enable row level security;
alter table public.cs_logs enable row level security;

-- Clean grants/policies
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ========= cs_admins =========
drop policy if exists cs_admins_admin_all on public.cs_admins;
create policy cs_admins_admin_all
  on public.cs_admins
  for all
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

grant execute on function public.cs_is_admin() to anon, authenticated;
grant execute on function public.cs_has_access(text) to authenticated;
grant execute on function public.cs_admin_set_by_email(text, boolean) to authenticated;
grant execute on function public.cs_device_unlock_by_email(text) to authenticated;

-- ========= cs_user_devices =========
drop policy if exists cs_user_devices_owner_select on public.cs_user_devices;
create policy cs_user_devices_owner_select
  on public.cs_user_devices
  for select
  using (user_id = auth.uid() or public.cs_is_admin());

drop policy if exists cs_user_devices_owner_upsert on public.cs_user_devices;
create policy cs_user_devices_owner_upsert
  on public.cs_user_devices
  for insert
  with check (user_id = auth.uid() or public.cs_is_admin());

drop policy if exists cs_user_devices_owner_update on public.cs_user_devices;
create policy cs_user_devices_owner_update
  on public.cs_user_devices
  for update
  using (user_id = auth.uid() or public.cs_is_admin())
  with check (user_id = auth.uid() or public.cs_is_admin());

-- ========= cs_orders =========
-- Inserção liberada (anon + auth) — o site cria pedido antes de ir pro pagamento
drop policy if exists cs_orders_insert_any on public.cs_orders;
create policy cs_orders_insert_any
  on public.cs_orders
  for insert
  with check (
    -- se estiver logado, user_id pode ser o próprio uid
    (user_id is null) or (user_id = auth.uid())
  );

-- leitura: dono (por user_id) OU por buyer_email = e-mail do JWT, e admin
drop policy if exists cs_orders_select_owner_or_admin on public.cs_orders;
create policy cs_orders_select_owner_or_admin
  on public.cs_orders
  for select
  using (
    public.cs_is_admin()
    or (user_id = auth.uid())
    or (lower(coalesce(buyer_email,'')) = lower(coalesce(auth.jwt() ->> 'email','')))
  );

-- update do dono: só pode marcar como pago (não pode aprovar)
drop policy if exists cs_orders_update_owner_paid on public.cs_orders;
create policy cs_orders_update_owner_paid
  on public.cs_orders
  for update
  using (
    (user_id = auth.uid())
    or (lower(coalesce(buyer_email,'')) = lower(coalesce(auth.jwt() ->> 'email','')))
  )
  with check (
    -- mantém dono
    ((user_id = auth.uid()) or (lower(coalesce(buyer_email,'')) = lower(coalesce(auth.jwt() ->> 'email',''))))
    -- não permite injetar aprovação
    and approved_at is null
    and approved_by is null
    and lower(coalesce(order_status,'')) = 'criado'
    and lower(coalesce(status,'')) = 'pending'
    and lower(coalesce(payment_status,'')) in ('pago','pendente')
  );

-- update admin: tudo
drop policy if exists cs_orders_update_admin on public.cs_orders;
create policy cs_orders_update_admin
  on public.cs_orders
  for update
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

-- ========= cs_products =========
drop policy if exists cs_products_read_public on public.cs_products;
create policy cs_products_read_public
  on public.cs_products
  for select
  using (true);

drop policy if exists cs_products_admin_write on public.cs_products;
create policy cs_products_admin_write
  on public.cs_products
  for all
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

-- ========= cs_providers =========
drop policy if exists cs_providers_select_vip on public.cs_providers;
create policy cs_providers_select_vip
  on public.cs_providers
  for select
  using (public.cs_is_admin() or public.cs_has_access('vip'));

drop policy if exists cs_providers_admin_write on public.cs_providers;
create policy cs_providers_admin_write
  on public.cs_providers
  for all
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

-- ========= cs_links =========
drop policy if exists cs_links_select_by_access on public.cs_links;
create policy cs_links_select_by_access
  on public.cs_links
  for select
  using (
    public.cs_is_admin()
    or public.cs_has_access(kind)
  );

drop policy if exists cs_links_admin_write on public.cs_links;
create policy cs_links_admin_write
  on public.cs_links
  for all
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

-- ========= cs_site_settings =========
drop policy if exists cs_site_settings_select_public on public.cs_site_settings;
create policy cs_site_settings_select_public
  on public.cs_site_settings
  for select
  using (true);

drop policy if exists cs_site_settings_admin_write on public.cs_site_settings;
create policy cs_site_settings_admin_write
  on public.cs_site_settings
  for all
  using (public.cs_is_admin())
  with check (public.cs_is_admin());

-- ========= cs_logs =========
drop policy if exists cs_logs_insert_auth on public.cs_logs;
create policy cs_logs_insert_auth
  on public.cs_logs
  for insert
  with check (auth.uid() is not null);

drop policy if exists cs_logs_select_admin on public.cs_logs;
create policy cs_logs_select_admin
  on public.cs_logs
  for select
  using (public.cs_is_admin());

-- Grants mínimos
grant select on public.cs_products to anon, authenticated;

grant insert on public.cs_orders to anon, authenticated;
grant select, update on public.cs_orders to authenticated;

grant select, insert, update on public.cs_user_devices to authenticated;

grant insert on public.cs_logs to authenticated;

-- Sequências (bigserial) — necessário para inserts
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to anon;
