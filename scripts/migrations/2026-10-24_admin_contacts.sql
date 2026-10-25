-- Admin contact capture: client contacts (update path) + optional event-day contact.
-- Additive and backward compatible: safe to run while the currently deployed
-- code (preview and production share one database) is still live.
-- Runs in one transaction. Does not touch RLS, table grants, anon grants, or
-- get_event_config / replace_event_config.

begin;

-- 1. Event-day contact columns (all nullable, no defaults, no constraints).
alter table public.events
  add column if not exists event_contact_name  text,
  add column if not exists event_contact_email text,
  add column if not exists event_contact_phone text;

-- 2. update_client_admin: used by the "Edit client" form.
create or replace function public.update_client_admin(
  p_id uuid,
  p_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clients
     set name          = p_name,
         contact_name  = p_contact_name,
         contact_email = p_contact_email,
         contact_phone = p_contact_phone
   where id = p_id;
  if not found then
    raise exception 'unknown_client' using errcode = 'P0003';
  end if;
end;
$$;

-- 3. update_event_contact_admin: touches ONLY the three event-day contact
--    columns. Empty / whitespace-only strings are stored as NULL.
create or replace function public.update_event_contact_admin(
  p_event_id text,
  p_event_contact_name text,
  p_event_contact_email text,
  p_event_contact_phone text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events
     set event_contact_name  = nullif(btrim(p_event_contact_name), ''),
         event_contact_email = nullif(btrim(p_event_contact_email), ''),
         event_contact_phone = nullif(btrim(p_event_contact_phone), '')
   where id = p_event_id;
  if not found then
    raise exception 'unknown_event' using errcode = 'P0002';
  end if;
end;
$$;

-- 4. create_event_admin: one function replaces both existing overloads,
--    (p_client_id, p_name) and (p_client_id, p_name, p_slug default null).
--    Body is the current 3-arg body plus the three optional contact params.
--    The old overloads must be dropped: leaving either next to the new
--    function makes named-argument calls ambiguous ("function is not unique").
--    Every existing call shape still resolves to the new function:
--      {p_client_id, p_name}                -> api/scripts shape, defaults fill in
--      {p_client_id, p_name, p_slug}        -> api/admin/create-event.js today
drop function if exists public.create_event_admin(uuid, text);
drop function if exists public.create_event_admin(uuid, text, text);

create function public.create_event_admin(
  p_client_id uuid,
  p_name text,
  p_slug text default null,
  p_event_contact_name text default null,
  p_event_contact_email text default null,
  p_event_contact_phone text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id text;
  new_pin text;
begin
  if not exists (select 1 from clients where id = p_client_id) then
    raise exception 'unknown_client' using errcode = 'P0003';
  end if;
  new_id := gen_random_uuid()::text;
  new_pin := lpad((floor(random()*10000))::text, 4, '0');
  insert into events (id, name, client_id, slug, organizer_pin,
                      event_contact_name, event_contact_email, event_contact_phone)
  values (new_id, p_name, p_client_id, nullif(trim(p_slug), ''), new_pin,
          nullif(btrim(p_event_contact_name), ''),
          nullif(btrim(p_event_contact_email), ''),
          nullif(btrim(p_event_contact_phone), ''));
  return new_id;
end;
$$;

-- 5. Lists: everything returned today is kept; contact fields are added.
create or replace function public.list_clients_admin()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name,
    'contactName', contact_name, 'contactEmail', contact_email, 'contactPhone', contact_phone
  ) order by name), '[]'::jsonb)
  from clients;
$$;

create or replace function public.list_events_admin()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ev.id, 'name', ev.name, 'active', ev.active, 'slug', ev.slug,
    'clientId', ev.client_id, 'clientName', cl.name, 'organizerPin', ev.organizer_pin,
    'eventContactName', ev.event_contact_name,
    'eventContactEmail', ev.event_contact_email,
    'eventContactPhone', ev.event_contact_phone
  ) order by cl.name, ev.name), '[]'::jsonb)
  from events ev join clients cl on cl.id = ev.client_id;
$$;

-- 6. Same lockdown as the other admin RPCs: reachable only through the
--    service-role-backed /api/admin/* routes. (New functions get Supabase's
--    default grants, so revoke explicitly.) CREATE OR REPLACE above kept the
--    existing ACLs on the two list functions.
revoke all on function public.update_client_admin(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_event_contact_admin(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_event_admin(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_client_admin(uuid, text, text, text, text) to service_role;
grant execute on function public.update_event_contact_admin(text, text, text, text) to service_role;
grant execute on function public.create_event_admin(uuid, text, text, text, text, text) to service_role;

commit;
