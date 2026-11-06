-- Item photos live in Supabase Storage, not inside item rows.
-- Files are public to read (they end up on public marketplace listings anyway) and
-- sit under <user id>/..., so each seller can only add, change or delete their own.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "item photos: owner can upload" on storage.objects;
create policy "item photos: owner can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "item photos: owner can update" on storage.objects;
create policy "item photos: owner can update" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "item photos: owner can delete" on storage.objects;
create policy "item photos: owner can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Storage only deletes (and updates) files the user can also select, so owners need
-- this too; without it a delete reports success and removes nothing.
drop policy if exists "item photos: owner can list" on storage.objects;
create policy "item photos: owner can list" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
