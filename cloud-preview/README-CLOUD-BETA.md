# Mikasa Cloud Beta Preview (GitHub Pages subpath)

This preview is isolated at `/cloud-preview/`; it does not replace the root production app by itself.

## 1) Create Supabase
- Create a Supabase project.
- Run `supabase/schema.sql` in Supabase SQL Editor.
- Configure Auth email/password; create the owner account.
- In Supabase Auth URL configuration, allow the deployed preview's URL (and its origin) as appropriate.
- In Database > Publications, enable `public.mikasa_workspaces` for Realtime if you want update notices.
- Confirm RLS/policies/grants and test in a non-production Supabase project first.

## 2) Publish preview
- Merge the cloud-beta preview PR to `main` only if you accept making the *preview path* public on GitHub Pages. Root `/` is left as-is by this change.
- Wait for Pages deployment, then open `https://ohmynexus.github.io/mikasa-v.1/cloud-preview/`.

## 3) First device
- Download a JSON backup from current authoritative Mikasa before starting.
- Tap Cloud; enter project URL, **public publishable/anon key**, owner email and password.
- Press Connect & Login. When cloud is empty, the app asks whether to migrate local data. Only approve on the source-of-truth device after backup.
- Verify the counts and several ledger rows, debt/paid totals and paid dates.

## 4) Other device
- Open the exact preview URL on the second device.
- Configure the same project URL/public key and login with the same owner account.
- Select Cloud > Load cloud data and confirm adoption.

## Important beta limitations
- Online-first beta. Not designed for offline write queues.
- Existing CRUD/restore calls continue to save locally immediately and asynchronously enqueue a revision-guarded whole-workspace cloud snapshot.
- Concurrent or remote edits pause cloud writes. A warning is shown; choose Load cloud data only after exporting local JSON if local changes matter.
- This is not a conflict merge engine. Do not perform simultaneous data entry across devices during the beta test.
- Test this only against disposable/test data or after creating independent JSON backups.
- CSV restore reconstructs only exported fields. JSON is the complete app snapshot.
- Project URL and publishable/anon key are public identifiers. Never use a Supabase secret/service_role key in the browser. Access depends on Auth + RLS + least privilege.
- No live Supabase project credentials were supplied, so real cloud sign-in/sync has not been run or verified here.
