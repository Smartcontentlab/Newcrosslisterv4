-- CrossLinkOS database schema (Supabase / Postgres)
-- Safe to run more than once: every statement is idempotent.
-- Run this in: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- It matches lib/db/src/schema/*.ts (the Drizzle definitions the API uses).

begin;

-- ---------------------------------------------------------------------------
-- Profiles (one row per signed-up user; created automatically by a trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  plan text not null default 'free',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Product tables
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  description text,
  brand text,
  model text,
  category text,
  size text,
  color text,
  measurements text,
  sku text,
  notes text,
  source_location text,
  source_url text,
  sold_platform text,
  sold_at timestamptz,
  condition text not null default 'good',
  status text not null default 'draft',
  price real not null default 0,
  cost real not null default 0,
  weight real,
  photos text[] not null default '{}',
  photo_records jsonb not null default '[]'::jsonb,
  marketplace_details jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  item_id integer not null,
  marketplace text not null,
  status text not null default 'draft',
  price real not null default 0,
  title text,
  description text,
  marketplace_listing_id text,
  listed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  item_id integer not null,
  listing_id integer,
  marketplace text not null,
  buyer_name text,
  sale_price real not null default 0,
  fees real not null default 0,
  shipping_cost real not null default 0,
  profit real not null default 0,
  status text not null default 'pending',
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_tasks (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  order_id integer not null,
  steps jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_drafts (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  item_id integer not null,
  marketplace text not null,
  status text not null default 'draft',
  title text,
  description text,
  tags text[] not null default '{}',
  price real not null default 0,
  required_fields jsonb not null default '[]'::jsonb,
  missing_fields text[] not null default '{}',
  external_listing_id text,
  external_url text,
  published_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delisting_tasks (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  item_id integer not null,
  order_id integer,
  marketplace text not null,
  marketplace_draft_id integer,
  status text not null default 'pending',
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buy_candidates (
  id serial primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  brand text,
  category text,
  purchase_cost real not null,
  recommendation text not null,
  rationale text not null,
  estimated_sale_price real not null,
  estimated_fees real not null,
  projected_profit real not null,
  confidence text not null,
  comps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an older version of these tables already exists, make sure the newer columns are present.
alter table public.items add column if not exists marketplace_details jsonb not null default '{}'::jsonb;
alter table public.items add column if not exists photo_records jsonb not null default '[]'::jsonb;
alter table public.items add column if not exists user_id uuid;
alter table public.listings add column if not exists user_id uuid;
alter table public.orders add column if not exists user_id uuid;
alter table public.shipping_tasks add column if not exists user_id uuid;
alter table public.marketplace_drafts add column if not exists user_id uuid;
alter table public.delisting_tasks add column if not exists user_id uuid;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists listings_user_id_idx on public.listings(user_id);
create index if not exists listings_item_id_idx on public.listings(item_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_item_id_idx on public.orders(item_id);
create index if not exists shipping_tasks_user_id_idx on public.shipping_tasks(user_id);
create index if not exists marketplace_drafts_user_id_idx on public.marketplace_drafts(user_id);
create index if not exists marketplace_drafts_item_id_idx on public.marketplace_drafts(item_id);
create index if not exists delisting_tasks_user_id_idx on public.delisting_tasks(user_id);
create index if not exists buy_candidates_user_id_idx on public.buy_candidates(user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_crosslinkos_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_crosslinkos_auth_user_created on auth.users;
create trigger on_crosslinkos_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_crosslinkos_user_created();

revoke execute on function public.handle_crosslinkos_user_created() from public, anon, authenticated;

-- Backfill: give a profile to anyone who signed up before the trigger existed.
insert into public.user_profiles (id, email, display_name)
select u.id,
       coalesce(u.email, ''),
       nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security: each signed-in user can only see and change their own rows.
-- (The API server also filters by user, this is a second lock on the door.)
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.items enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.shipping_tasks enable row level security;
alter table public.marketplace_drafts enable row level security;
alter table public.delisting_tasks enable row level security;
alter table public.buy_candidates enable row level security;

drop policy if exists "crosslinkos_profile_owner_select" on public.user_profiles;
create policy "crosslinkos_profile_owner_select"
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "crosslinkos_items_owner" on public.items;
create policy "crosslinkos_items_owner"
  on public.items for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_listings_owner" on public.listings;
create policy "crosslinkos_listings_owner"
  on public.listings for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_orders_owner" on public.orders;
create policy "crosslinkos_orders_owner"
  on public.orders for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_shipping_tasks_owner" on public.shipping_tasks;
create policy "crosslinkos_shipping_tasks_owner"
  on public.shipping_tasks for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_marketplace_drafts_owner" on public.marketplace_drafts;
create policy "crosslinkos_marketplace_drafts_owner"
  on public.marketplace_drafts for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_delisting_tasks_owner" on public.delisting_tasks;
create policy "crosslinkos_delisting_tasks_owner"
  on public.delisting_tasks for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "crosslinkos_buy_candidates_owner" on public.buy_candidates;
create policy "crosslinkos_buy_candidates_owner"
  on public.buy_candidates for all to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;
