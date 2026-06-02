-- Create private receipts storage bucket.
-- Images are uploaded directly from the client after OCR; stored at {userId}/{receiptId}.jpg|png.
-- RLS policies allow each user to read and write only their own receipts.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Users can upload to their own folder.
create policy "receipts_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own receipts.
create policy "receipts_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can overwrite (upsert) their own receipts.
create policy "receipts_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own receipts.
create policy "receipts_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
