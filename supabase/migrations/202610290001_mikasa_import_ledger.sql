-- Draft only: review and test before applying to the linked Supabase project.
-- Atomic import, authenticated caller only; ownership is derived from auth.uid().
create or replace function public.mikasa_import_ledger(p_customers jsonb, p_bills jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c jsonb;
  v_b jsonb;
  v_name text;
  v_norm text;
  v_period text;
  v_amount bigint;
  v_status text;
  v_customer_id uuid;
  v_customer_count integer;
  v_existing_amount bigint;
  v_existing_status text;
  v_existing_deleted boolean;
  v_added_customers integer := 0;
  v_reused_customers integer := 0;
  v_added_bills integer := 0;
  v_skipped_bills integer := 0;
  v_map jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_customers) <> 'array' or jsonb_typeof(p_bills) <> 'array' then
    raise exception 'Payload must contain customer and bill arrays';
  end if;
  if jsonb_array_length(p_customers) > 10000 or jsonb_array_length(p_bills) > 50000 then
    raise exception 'Payload exceeds allowed size';
  end if;

  -- Serialize imports for the same account to close cross-device check/insert races.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Validate every bill before any writes.
  for v_b in select value from jsonb_array_elements(p_bills) loop
    v_name := btrim(coalesce(v_b->>'name',''));
    v_period := coalesce(v_b->>'period','');
    if v_name = '' or v_period !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid bill name or period'; end if;
    if (v_period::date)::text <> v_period then raise exception 'Invalid calendar date'; end if;
    if coalesce(v_b->>'amount','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid amount'; end if;
    if (v_b->>'amount')::numeric > 9007199254740991 then raise exception 'Amount exceeds safe range'; end if;
    if coalesce(v_b->>'status','') not in ('paid','unpaid') then raise exception 'Invalid status'; end if;
  end loop;

  -- Reject conflicting source facts for same normalized name and period.
  if exists (
    select 1 from jsonb_array_elements(p_bills) x
    group by lower(normalize(btrim(x.value->>'name'), NFKC)), x.value->>'period'
    having count(distinct (x.value->>'amount', x.value->>'status')) > 1
  ) then raise exception 'Conflicting source bills'; end if;

  -- Resolve only unique active customer names. Ambiguous existing names abort all.
  for v_c in select value from jsonb_array_elements(p_customers) loop
    v_name := btrim(coalesce(v_c#>>'{}',''));
    if v_name = '' then continue; end if;
    v_norm := lower(normalize(v_name, NFKC));
    select count(*), min(id::text)::uuid into v_customer_count, v_customer_id
    from public.mikasa_customers
    where user_id=v_uid and deleted=false and lower(normalize(btrim(name), NFKC))=v_norm;
    if v_customer_count > 1 then raise exception 'Ambiguous existing customer name: %', v_name; end if;
    if v_customer_count = 1 then
      v_map := v_map || jsonb_build_object(v_norm, v_customer_id);
      v_reused_customers := v_reused_customers + 1;
    else
      insert into public.mikasa_customers(user_id,name,phone,notes)
      values(v_uid,v_name,null,null) returning id into v_customer_id;
      v_map := v_map || jsonb_build_object(v_norm, v_customer_id);
      v_added_customers := v_added_customers + 1;
    end if;
  end loop;

  -- Every bill key is reconciled; matching key must also match amount and status.
  for v_b in select value from jsonb_array_elements(p_bills) loop
    v_name := btrim(v_b->>'name');
    v_norm := lower(normalize(v_name, NFKC));
    v_customer_id := (v_map->>v_norm)::uuid;
    if v_customer_id is null then raise exception 'Customer mapping missing'; end if;
    v_period := v_b->>'period'; v_amount := (v_b->>'amount')::bigint; v_status := v_b->>'status';
    select amount,status,deleted into v_existing_amount,v_existing_status,v_existing_deleted
    from public.mikasa_bills
    where user_id=v_uid and customer_id=v_customer_id and period=v_period
    for update;
    if found then
      if v_existing_deleted then
        raise exception 'Deleted cloud bill occupies customer/period; manual review required';
      end if;
      if v_existing_amount<>v_amount or v_existing_status<>v_status then
        raise exception 'Cloud bill conflict for customer/period';
      end if;
      v_skipped_bills := v_skipped_bills + 1;
    else
      insert into public.mikasa_bills(user_id,customer_id,period,amount,status)
      values(v_uid,v_customer_id,v_period,v_amount,v_status);
      v_added_bills := v_added_bills + 1;
    end if;
  end loop;
  return jsonb_build_object('customers_added',v_added_customers,'customers_reused',v_reused_customers,
    'bills_added',v_added_bills,'bills_skipped',v_skipped_bills);
end;
$$;

revoke all on function public.mikasa_import_ledger(jsonb,jsonb) from public, anon;
grant execute on function public.mikasa_import_ledger(jsonb,jsonb) to authenticated;
