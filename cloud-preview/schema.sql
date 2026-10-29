-- Mikasa cloud sync: one private workspace per authenticated owner.
-- Run once in Supabase SQL Editor. Keep RLS enabled.
create table if not exists public.mikasa_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"records":[],"customers":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint payload_shape check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'records') = 'array'
    and jsonb_typeof(payload->'customers') = 'array'
  )
);
alter table public.mikasa_workspaces enable row level security;
revoke all on public.mikasa_workspaces from anon;
revoke all on public.mikasa_workspaces from authenticated;
grant select on public.mikasa_workspaces to authenticated;
drop policy if exists "owner reads own Mikasa workspace" on public.mikasa_workspaces;
create policy "owner reads own Mikasa workspace"
  on public.mikasa_workspaces for select to authenticated
  using (auth.uid() = owner_id);

-- Client cannot insert/update directly. A compare-and-swap RPC prevents silent
-- overwrite if another device has changed the shared state.
create or replace function public.mikasa_save_workspace(
  p_payload jsonb,
  p_expected_revision bigint
) returns table(ok boolean, new_revision bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_rev bigint;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload->'records') <> 'array'
     or jsonb_typeof(p_payload->'customers') <> 'array' then
    raise exception 'Invalid Mikasa payload';
  end if;
  insert into public.mikasa_workspaces(owner_id,payload,revision,updated_at)
  values (v_owner,p_payload,1,now())
  on conflict (owner_id) do nothing
  returning revision into v_rev;
  if found then
    return query select true, v_rev; return;
  end if;
  select revision into v_rev from public.mikasa_workspaces
   where owner_id = v_owner for update;
  if v_rev <> p_expected_revision then
    return query select false, v_rev; return;
  end if;
  update public.mikasa_workspaces
     set payload=p_payload, revision=revision+1, updated_at=now()
   where owner_id=v_owner returning revision into v_rev;
  return query select true, v_rev;
end $$;
revoke all on function public.mikasa_save_workspace(jsonb,bigint) from public, anon;
grant execute on function public.mikasa_save_workspace(jsonb,bigint) to authenticated;

-- Enable Postgres Changes for the table in Supabase Dashboard if using realtime.
