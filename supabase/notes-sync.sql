create table public.cfh_notes (
 owner_id uuid not null references auth.users(id),
 id text not null,
 payload jsonb,
 primary key (owner_id,id)
);
alter table public.cfh_notes enable row level security;
revoke all on public.cfh_notes from anon;
grant select,insert,update on public.cfh_notes to authenticated;
create policy cfh_notes_owner on public.cfh_notes for all to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter publication supabase_realtime add table public.cfh_notes;
insert into storage.buckets(id,name,public,file_size_limit) values ('cfh-note-media','cfh-note-media',false,26214400);
create policy cfh_note_media_read on storage.objects for select to authenticated
 using (bucket_id='cfh-note-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cfh_note_media_insert on storage.objects for insert to authenticated
 with check (bucket_id='cfh-note-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy cfh_note_media_delete on storage.objects for delete to authenticated
 using (bucket_id='cfh-note-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
