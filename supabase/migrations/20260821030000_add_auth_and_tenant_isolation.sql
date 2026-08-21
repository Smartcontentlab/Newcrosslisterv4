begin;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  plan text not null default 'free',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.items add column if not exists user_id uuid;
alter table public.listings add column if not exists user_id uuid;
alter table public.orders add column if not exists user_id uuid;
alter table public.shipping_tasks add column if not exists user_id uuid;
alter table public.marketplace_drafts add column if not exists user_id uuid;
alter table public.delisting_tasks add column if not exists user_id uuid;

alter table public.items drop constraint if exists items_user_id_fkey;
alter table public.listings drop constraint if exists listings_user_id_fkey;
alter table public.orders drop constraint if exists orders_user_id_fkey;
alter table public.shipping_tasks drop constraint if exists shipping_tasks_user_id_fkey;
alter table public.marketplace_drafts drop constraint if exists marketplace_drafts_user_id_fkey;
alter table public.delisting_tasks drop constraint if exists delisting_tasks_user_id_fkey;

alter table public.items add constraint items_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.listings add constraint listings_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.orders add constraint orders_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.shipping_tasks add constraint shipping_tasks_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.marketplace_drafts add constraint marketplace_drafts_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;
alter table public.delisting_tasks add constraint delisting_tasks_user_id_fkey foreign key (user_id) references public.user_profiles(id) on delete cascade;

create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists listings_user_id_idx on public.listings(user_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists shipping_tasks_user_id_idx on public.shipping_tasks(user_id);
create index if not exists marketplace_drafts_user_id_idx on public.marketplace_drafts(user_id);
create index if not exists delisting_tasks_user_id_idx on public.delisting_tasks(user_id);

alter table public.user_profiles enable row level security;
alter table public.items enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.shipping_tasks enable row level security;
alter table public.marketplace_drafts enable row level security;
alter table public.delisting_tasks enable row level security;

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

commit;
