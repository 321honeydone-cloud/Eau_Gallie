-- EGE Field sync backend. Run this once in the Supabase SQL editor of a new project.
-- One generic table holds every synced row as JSON. A private bucket holds photos and sheets.
-- No login on the tablets, so the anon key can read and write. Keep the key inside the company.

create table if not exists public.sync_rows (
  id text primary key,                 -- "<table>:<row id>"
  tbl text not null,
  job_id text not null default '',
  updated_at bigint not null,          -- tablet clock, ms
  server_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted boolean not null default false,
  data jsonb
);
create index if not exists sync_rows_tbl_server_at on public.sync_rows (tbl, server_at);

-- server_at moves every time a row is upserted, so pulls see it again
create or replace function public.sync_rows_touch() returns trigger language plpgsql as $$
begin
  new.server_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
end $$;
drop trigger if exists sync_rows_touch on public.sync_rows;
create trigger sync_rows_touch before insert or update on public.sync_rows for each row execute function public.sync_rows_touch();

alter table public.sync_rows enable row level security;
drop policy if exists "anon all" on public.sync_rows;
create policy "anon all" on public.sync_rows for all to anon using (true) with check (true);

-- files bucket for photos, sheets, signatures
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
drop policy if exists "anon files all" on storage.objects;
create policy "anon files all" on storage.objects for all to anon using (bucket_id = 'files') with check (bucket_id = 'files');
