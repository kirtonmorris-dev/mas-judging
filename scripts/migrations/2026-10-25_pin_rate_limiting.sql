-- PIN rate limiting, phase 1 of 2: ADDITIVE ONLY.
--
-- Safe to run while the currently deployed client is still live (preview and
-- production share one database). Nothing here drops or changes the return
-- type of anything the old client calls:
--   * check_event_organizer_pin(text,text) -> boolean   : untouched
--   * get_event_config                                  : still returns every
--     judge's plaintext `pin` (phase 2 removes it); only ADDS a `hasPin` flag
--   * replace_event_config                              : same signature; see
--     the PIN-preservation rule below
--   * reset_event_organizer_pin, list_events_admin      : same signature and
--     return type; each only ADDS behavior / a key
--
-- Phase 2 (2026-10-25_pin_rate_limiting_phase2_retire_legacy.sql) removes the
-- old behavior and must NOT be run until the new client is live on main and
-- verified.
--
-- Policy: 5 failed attempts -> 5-minute lockout, tracked per event and per
-- target ('organizer', or 'judge:<slot>'). A correct PIN resets the target's
-- count. While locked, even the correct PIN is refused. An expired lockout
-- starts a fresh window of 5 attempts.

begin;

-- 1. Attempt tracking. RLS on, no policies, no grants: only the security
--    definer functions below (owned by postgres, which owns this table and so
--    bypasses RLS) can touch it. Deleting an event cascades its rows away.
create table if not exists public.pin_attempts (
  event_id        text        not null references public.events(id) on delete cascade,
  target          text        not null,
  failed_count    integer     not null default 0,
  locked_until    timestamptz,
  last_failure_at timestamptz,
  primary key (event_id, target)
);
alter table public.pin_attempts enable row level security;
revoke all on table public.pin_attempts from public, anon, authenticated;

-- 2. Shared limiter. Internal only: no role other than the owner can execute
--    it, it is reached through the public wrappers below.
--
--    Atomicity: the row is created if missing, then locked FOR UPDATE, so
--    concurrent guesses against one target are serialized and each sees the
--    count left by the one before it. Never RAISE after counting a failure --
--    the exception would roll the increment back -- always return jsonb.
create or replace function public.pin_attempt_register(
  p_event_id text, p_target text, p_matched boolean
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  max_attempts constant integer := 5;
  lock_seconds constant integer := 300;
  r pin_attempts%rowtype;
  now_ts timestamptz := clock_timestamp();
begin
  insert into pin_attempts (event_id, target)
  values (p_event_id, p_target)
  on conflict (event_id, target) do nothing;

  select * into r from pin_attempts
   where event_id = p_event_id and target = p_target
   for update;

  if r.locked_until is not null and r.locked_until > now_ts then
    return jsonb_build_object(
      'ok', false, 'locked', true,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (r.locked_until - now_ts)))::integer),
      'attemptsLeft', 0);
  end if;

  if r.locked_until is not null then
    r.failed_count := 0;  -- lockout expired: fresh window
  end if;

  if p_matched then
    update pin_attempts
       set failed_count = 0, locked_until = null
     where event_id = p_event_id and target = p_target;
    return jsonb_build_object('ok', true, 'locked', false, 'retryAfterSeconds', 0, 'attemptsLeft', max_attempts);
  end if;

  r.failed_count := r.failed_count + 1;
  if r.failed_count >= max_attempts then
    update pin_attempts
       set failed_count = r.failed_count,
           locked_until = now_ts + make_interval(secs => lock_seconds),
           last_failure_at = now_ts
     where event_id = p_event_id and target = p_target;
    return jsonb_build_object('ok', false, 'locked', true, 'retryAfterSeconds', lock_seconds, 'attemptsLeft', 0);
  end if;

  update pin_attempts
     set failed_count = r.failed_count, locked_until = null, last_failure_at = now_ts
   where event_id = p_event_id and target = p_target;
  return jsonb_build_object('ok', false, 'locked', false, 'retryAfterSeconds', 0,
                            'attemptsLeft', max_attempts - r.failed_count);
end;
$$;

-- 3. Organizer PIN check, v2. Returns {ok, locked, retryAfterSeconds, attemptsLeft}.
--    (Unknown event: {ok:false, unknown:true}; nothing is tracked for it.)
create or replace function public.check_organizer_pin_v2(p_event_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  stored text;
begin
  select organizer_pin into stored from events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'locked', false, 'retryAfterSeconds', 0, 'attemptsLeft', 0, 'unknown', true);
  end if;
  return pin_attempt_register(p_event_id, 'organizer', stored is not null and p_pin is not null and stored = p_pin);
end;
$$;

-- 4. Judge PIN check. Same shape, plus:
--      noPin:true   -> this judge has no PIN yet (first-login flow); the
--                      client should offer "Set your PIN". Nothing is counted
--                      because there is nothing to guess.
--      unknown:true -> no such event/judge slot; nothing is tracked.
create or replace function public.check_judge_pin(p_event_id text, p_slot text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  stored text;
begin
  select pin into stored from judges where event_id = p_event_id and slot = p_slot;
  if not found then
    return jsonb_build_object('ok', false, 'locked', false, 'retryAfterSeconds', 0, 'attemptsLeft', 0, 'unknown', true);
  end if;
  if stored is null then
    return jsonb_build_object('ok', false, 'locked', false, 'retryAfterSeconds', 0, 'attemptsLeft', 0, 'noPin', true);
  end if;
  return pin_attempt_register(p_event_id, 'judge:' || p_slot, p_pin is not null and stored = p_pin);
end;
$$;

-- 5. First-login PIN. Only succeeds while the judge's PIN is null; the
--    single UPDATE ... WHERE pin IS NULL is atomic, so two devices racing to
--    claim a slot cannot both win.
--    Returns {ok:true} or {ok:false, error: invalid_pin | pin_already_set | unknown_judge}.
create or replace function public.set_judge_first_pin(p_event_id text, p_slot text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;
  update judges set pin = p_pin
   where event_id = p_event_id and slot = p_slot and pin is null;
  if found then
    return jsonb_build_object('ok', true);
  end if;
  if exists (select 1 from judges where event_id = p_event_id and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'pin_already_set');
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_judge');
end;
$$;

-- 6. get_event_config: ADD `hasPin` per judge. `pin` is still returned in this
--    phase because the currently deployed client compares it locally; phase 2
--    removes it. Everything else is byte-for-byte the current definition.
create or replace function public.get_event_config(p_event_id text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', ev.id,
    '_rev', ev.rev,
    'name', ev.name,
    'scope', ev.scope,
    'active', ev.active,
    'competitionFamily', ev.competition_family,
    'competitionType', ev.competition_type,
    'contestantLabel', ev.contestant_label,
    'contestantLabelPlural', ev.contestant_label_plural,
    'fieldLabels', ev.field_labels,
    'eventDateStart', ev.event_date_start,
    'eventDateEnd', ev.event_date_end,
    'venue', ev.venue,
    'judges', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.slot, 'realName', j.real_name, 'pin', j.pin, 'hasPin', j.pin is not null) order by j.id)
      from judges j where j.event_id = ev.id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'entryType', c.entry_type,
        'criteria', c.criteria, 'stages', c.stages, 'extraFields', c.extra_fields,
        'contestants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ct.id, 'band', ct.band, 'masquerader', ct.masquerader, 'portrayal', ct.portrayal,
            'extra', ct.extra, 'assignedJudges', ct.assigned_judges
          ))
          from contestants ct where ct.category_id = c.id
        ), '[]'::jsonb)
      ))
      from categories c where c.event_id = ev.id
    ), '[]'::jsonb)
  )
  from events ev
  where ev.id = p_event_id;
$$;

-- 7. replace_event_config: PIN-preservation rule. Everything outside the
--    judges loop is the current definition, unchanged.
--
--    Judges are still deleted and re-inserted on every save, so the stored
--    PINs are snapshotted first and a judge's PIN is decided like this:
--      * payload judge has  "resetPin": true  -> PIN becomes NULL (deliberate
--        reset) and that judge's lockout row is cleared
--      * otherwise, an existing stored PIN for that slot is KEPT, whatever
--        the payload says (omitted, null, or a different value)
--      * otherwise (new slot, or slot whose PIN is null) a well-formed
--        4-digit payload `pin` is accepted, which is exactly what first
--        login does and what the old client still sends during rollout;
--        anything else leaves it null
--    Lockout rows for judge slots that no longer exist are removed so a
--    later judge reusing "Judge N" does not inherit a stale lockout.
create or replace function public.replace_event_config(p_event_id text, p_event jsonb, p_expected_rev integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_rev integer;
  new_rev integer;
  j jsonb;
  c jsonb;
  ct jsonb;
  old_pins jsonb;
  new_pin text;
  reset_targets text[] := '{}';
begin
  select rev into current_rev from events where id = p_event_id for update;
  if current_rev is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if p_expected_rev is not null and current_rev <> p_expected_rev then
    raise exception 'config_rev_conflict' using errcode = 'P0001';
  end if;

  update events set
    name = coalesce(p_event->>'name', name),
    scope = coalesce(p_event->>'scope', scope),
    active = coalesce((p_event->>'active')::boolean, active),
    competition_family = p_event->>'competitionFamily',
    competition_type = p_event->>'competitionType',
    contestant_label = coalesce(p_event->>'contestantLabel', contestant_label),
    contestant_label_plural = coalesce(p_event->>'contestantLabelPlural', contestant_label_plural),
    field_labels = coalesce(p_event->'fieldLabels', field_labels),
    event_date_start = coalesce(nullif(p_event->>'eventDateStart','')::date, event_date_start),
    event_date_end = coalesce(nullif(p_event->>'eventDateEnd','')::date, event_date_end),
    venue = coalesce(p_event->>'venue', venue),
    updated_at = now()
  where id = p_event_id;

  select coalesce(jsonb_object_agg(slot, pin), '{}'::jsonb) into old_pins
    from judges where event_id = p_event_id and pin is not null;

  delete from contestants where category_id in (select id from categories where event_id = p_event_id);
  delete from categories where event_id = p_event_id;
  delete from judges where event_id = p_event_id;

  for j in select * from jsonb_array_elements(coalesce(p_event->'judges','[]'::jsonb))
  loop
    if coalesce(j->>'resetPin', '') = 'true' then
      new_pin := null;
      reset_targets := reset_targets || ('judge:' || (j->>'name'));
    else
      new_pin := coalesce(
        old_pins->>(j->>'name'),
        case when j->>'pin' ~ '^[0-9]{4}$' then j->>'pin' end
      );
    end if;
    insert into judges (event_id, slot, real_name, pin)
    values (p_event_id, j->>'name', coalesce(j->>'realName', j->>'name'), new_pin);
  end loop;

  delete from pin_attempts
   where event_id = p_event_id
     and target like 'judge:%'
     and (target = any(reset_targets)
          or target not in (select 'judge:' || slot from judges where event_id = p_event_id));

  for c in select * from jsonb_array_elements(coalesce(p_event->'categories','[]'::jsonb))
  loop
    insert into categories (id, event_id, name, entry_type, criteria, stages, extra_fields)
    values (
      c->>'id', p_event_id, c->>'name', coalesce(c->>'entryType','individual'),
      coalesce(c->'criteria','[]'::jsonb), coalesce(c->'stages','[]'::jsonb), coalesce(c->'extraFields','[]'::jsonb)
    );

    for ct in select * from jsonb_array_elements(coalesce(c->'contestants','[]'::jsonb))
    loop
      insert into contestants (id, category_id, band, masquerader, portrayal, extra, assigned_judges)
      values (
        ct->>'id', c->>'id', ct->>'band', ct->>'masquerader', ct->>'portrayal',
        coalesce(ct->'extra','{}'::jsonb), coalesce(ct->'assignedJudges','[]'::jsonb)
      );
    end loop;
  end loop;

  new_rev := current_rev + 1;
  update events set rev = new_rev where id = p_event_id;
  return new_rev;
end;
$$;

-- 8. Admin side (service_role only, reached via /api/admin/*).
--    reset_event_organizer_pin: same signature/return; now also clears the
--    event's organizer lockout.
create or replace function public.reset_event_organizer_pin(p_event_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_pin text;
begin
  if not exists (select 1 from events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  new_pin := lpad((floor(random()*10000))::text, 4, '0');
  update events set organizer_pin = new_pin where id = p_event_id;
  delete from pin_attempts where event_id = p_event_id and target = 'organizer';
  return new_pin;
end;
$$;

--    unlock_event_pins_admin: clears the organizer lockout AND every judge
--    lockout for one event. Returns how many tracked targets were cleared.
create or replace function public.unlock_event_pins_admin(p_event_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  if not exists (select 1 from events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  with d as (delete from pin_attempts where event_id = p_event_id returning 1)
  select count(*) into n from d;
  return n;
end;
$$;

--    list_events_admin: same as today plus `lockedTargets` -- the targets
--    ('organizer', 'judge:Judge 2', ...) whose lockout is active right now.
create or replace function public.list_events_admin()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ev.id, 'name', ev.name, 'active', ev.active, 'slug', ev.slug,
    'clientId', ev.client_id, 'clientName', cl.name, 'organizerPin', ev.organizer_pin,
    'eventContactName', ev.event_contact_name,
    'eventContactEmail', ev.event_contact_email,
    'eventContactPhone', ev.event_contact_phone,
    'lockedTargets', coalesce((
      select jsonb_agg(pa.target order by pa.target)
        from pin_attempts pa
       where pa.event_id = ev.id and pa.locked_until is not null and pa.locked_until > now()
    ), '[]'::jsonb)
  ) order by cl.name, ev.name), '[]'::jsonb)
  from events ev join clients cl on cl.id = ev.client_id;
$$;

-- 9. Grants. New functions get Supabase's default grants (PUBLIC + anon +
--    authenticated + service_role), so revoke first and grant back only what
--    each one needs. CREATE OR REPLACE above preserved the existing ACLs of
--    get_event_config / replace_event_config (anon-callable, as before) and of
--    reset_event_organizer_pin / list_events_admin (service_role only).
revoke all on function public.pin_attempt_register(text, text, boolean) from public, anon, authenticated;

revoke all on function public.check_organizer_pin_v2(text, text) from public, anon, authenticated;
revoke all on function public.check_judge_pin(text, text, text) from public, anon, authenticated;
revoke all on function public.set_judge_first_pin(text, text, text) from public, anon, authenticated;
grant execute on function public.check_organizer_pin_v2(text, text) to anon;
grant execute on function public.check_judge_pin(text, text, text) to anon;
grant execute on function public.set_judge_first_pin(text, text, text) to anon;

revoke all on function public.unlock_event_pins_admin(text) from public, anon, authenticated;
grant execute on function public.unlock_event_pins_admin(text) to service_role;

commit;
