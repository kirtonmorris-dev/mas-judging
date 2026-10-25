-- Close judging, phase 1 of 2: ADDITIVE ONLY.
--
-- Safe to run while the currently deployed client is live (preview and
-- production share one database). Nothing here drops or revokes anything the
-- deployed client calls:
--   * events.scoring_closed_at, score_history.reason, score_history.old_values
--     are new nullable columns; no deployed query selects them.
--   * get_event_config / list_events_admin / replace_event_config /
--     delete_event_own keep their signatures and return types. Each only ADDS
--     a key (scoringClosedAt) or a refusal that applies to CLOSED events, and
--     nothing is closed until an organizer presses the button.
--   * The anon INSERT/UPDATE/DELETE grants on scores/score_history are NOT
--     touched. They are revoked in phase 2
--     (2026-10-25_close_judging_phase2_revoke_score_writes.sql), which must not
--     run until the new client is live on main, verified, and no event is live.
--     Until phase 2 runs, the close is enforced for every client that uses the
--     new RPCs but a stale browser tab or a script can still write directly.
--
-- Closed-event rules:
--   * submit_judge_score / retract_judge_score refuse with 'judging_closed'.
--   * organizer_correct_score still works, but needs a reason of at least two
--     words, and logs old value, new value, reason to score_history.
--   * replace_event_config and delete_event_own refuse with 'judging_closed'
--     (structure frozen; to delete a closed event an admin reopens it first).
--   * Reopen is admin-only (service_role), behind /api/admin/reopen-scoring.
--
-- Concurrency: every writer takes a row lock on the event. Score submits take
-- FOR SHARE; close, reopen, replace_event_config and delete take FOR UPDATE.
-- A close therefore waits for in-flight submits, and any submit that starts
-- after it sees the closed flag. Timestamps use clock_timestamp() taken AFTER
-- the lock is held, so no score is stamped later than the close timestamp.
--
-- Fairness: a row-level FOR UPDATE can be starved by a steady stream of
-- overlapping FOR SHARE lockers (new share lockers do not queue behind a
-- waiting FOR UPDATE). Measured locally with 32 parallel submitters: close
-- landed only when the load stopped. So submit/retract also take a per-event
-- SHARED advisory lock and close/reopen take the EXCLUSIVE one first; the lock
-- manager queues new shared requests behind a waiting exclusive one, so a
-- close gets in after the in-flight submits finish. The row lock is kept.
-- Lock order is always advisory first, then the event row; no function waits
-- on an advisory lock while holding the event row.

begin;

-- 1. Columns.
alter table public.events        add column if not exists scoring_closed_at timestamptz;
alter table public.score_history add column if not exists reason     text;
alter table public.score_history add column if not exists old_values jsonb;

-- 2. Lock log. No FK on purpose: the record of a close survives deleting the
--    event. RLS on, no policies, no grants: only security definer functions
--    (owned by postgres) touch it.
create table if not exists public.event_lock_log (
  id       bigint generated always as identity primary key,
  event_id text        not null,
  action   text        not null check (action in ('close', 'reopen')),
  actor    text        not null check (actor in ('organizer', 'admin')),
  at       timestamptz not null default clock_timestamp()
);
alter table public.event_lock_log enable row level security;
revoke all on table public.event_lock_log from public, anon, authenticated;
create index if not exists event_lock_log_event_idx on public.event_lock_log (event_id, at);

-- 3. Judge score write. One transaction: lock event, refuse if closed, upsert
--    the score row, append the history row.
--    Organizer-edit fields are derived from the entry the same way the old
--    client did (scoreRowFromEntry), so an entry that already carries
--    editedByOrganizer / lastEditedAt / previousValues keeps them.
create or replace function public.submit_judge_score(
  p_event_id text, p_category_id text, p_contestant_id text, p_judge_slot text,
  p_values jsonb, p_total_only boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed   timestamptz;
  ts       timestamptz;
  old_vals jsonb;
  edited   boolean;
  last_ed  timestamptz;
  prev     jsonb;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid_score' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('scoring:' || p_event_id, 0));
  select scoring_closed_at into closed from events where id = p_event_id for share;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if closed is not null then
    raise exception 'judging_closed' using errcode = 'P0001';
  end if;

  ts := clock_timestamp();
  edited := coalesce((p_values->>'editedByOrganizer') = 'true', false);
  last_ed := case when (p_values->>'lastEditedAt') ~ '^\d+(\.\d+)?$'
                  then to_timestamp((p_values->>'lastEditedAt')::double precision / 1000.0) end;
  prev := case when jsonb_typeof(p_values->'previousValues') = 'object' then p_values->'previousValues' end;

  select values into old_vals from scores
   where event_id = p_event_id and category_id = p_category_id
     and contestant_id = p_contestant_id and judge_slot = p_judge_slot
   for update;

  insert into scores (event_id, category_id, contestant_id, judge_slot, values, total_only,
                      submitted_at, edited_by_organizer, last_edited_at, previous_values)
  values (p_event_id, p_category_id, p_contestant_id, p_judge_slot, p_values, coalesce(p_total_only, false),
          ts, edited, last_ed, prev)
  on conflict (event_id, category_id, contestant_id, judge_slot) do update set
    values = excluded.values,
    total_only = excluded.total_only,
    submitted_at = excluded.submitted_at,
    edited_by_organizer = excluded.edited_by_organizer,
    last_edited_at = excluded.last_edited_at,
    previous_values = excluded.previous_values;

  insert into score_history (event_id, category_id, contestant_id, judge_slot, values, changed_at, changed_by, old_values)
  values (p_event_id, p_category_id, p_contestant_id, p_judge_slot, p_values, ts, 'judge', old_vals);

  return jsonb_build_object('ok', true, 'submittedAt', ts);
end;
$$;

-- 4. Judge Undo (the 6-second toast on a judge's own submission). With
--    p_restore it puts the previous entry back, without it removes the score.
--    Refused once judging is closed, like any other judge write. A removal is
--    logged to score_history (changed_by 'judge_undo') so it leaves a trace.
create or replace function public.retract_judge_score(
  p_event_id text, p_category_id text, p_contestant_id text, p_judge_slot text,
  p_restore jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed   timestamptz;
  ts       timestamptz;
  old_vals jsonb;
begin
  if p_restore is not null then
    return submit_judge_score(p_event_id, p_category_id, p_contestant_id, p_judge_slot, p_restore, false);
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('scoring:' || p_event_id, 0));
  select scoring_closed_at into closed from events where id = p_event_id for share;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if closed is not null then
    raise exception 'judging_closed' using errcode = 'P0001';
  end if;

  ts := clock_timestamp();
  delete from scores
   where event_id = p_event_id and category_id = p_category_id
     and contestant_id = p_contestant_id and judge_slot = p_judge_slot
  returning values into old_vals;

  if old_vals is null then
    return jsonb_build_object('ok', true, 'deleted', false);
  end if;

  insert into score_history (event_id, category_id, contestant_id, judge_slot, values, changed_at, changed_by, old_values, reason)
  values (p_event_id, p_category_id, p_contestant_id, p_judge_slot, old_vals, ts, 'judge_undo', old_vals, 'Judge undid submission');

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

-- 5. Organizer correction. Verifies the organizer PIN on the server through the
--    shared limiter (a wrong PIN counts toward the organizer lockout), requires
--    a reason once judging is closed, and writes the score + history row
--    atomically. A PIN failure RETURNS jsonb (raising would roll the counted
--    failure back); every other failure raises.
--    p_new_values is the full corrected entry built by the client. The server
--    owns the organizer-edit bookkeeping: editedByOrganizer, lastEditedAt and
--    previousValues (the original snapshot, captured once) are set here.
create or replace function public.organizer_correct_score(
  p_event_id text, p_pin text, p_category_id text, p_contestant_id text, p_judge_slot text,
  p_new_values jsonb, p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed   timestamptz;
  stored   text;
  pin_res  jsonb;
  reason   text;
  ts       timestamptz;
  ms       bigint;
  old_row  scores%rowtype;
  had_row  boolean;
  prev     jsonb;
  final    jsonb;
begin
  if p_new_values is null or jsonb_typeof(p_new_values) <> 'object' then
    raise exception 'invalid_score' using errcode = '22023';
  end if;

  select scoring_closed_at, organizer_pin into closed, stored
    from events where id = p_event_id for share;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  pin_res := pin_attempt_register(p_event_id, 'organizer',
                                  stored is not null and p_pin is not null and stored = p_pin);
  if not (pin_res->>'ok')::boolean then
    return pin_res || jsonb_build_object(
      'error', case when (pin_res->>'locked')::boolean then 'locked' else 'bad_pin' end);
  end if;

  reason := nullif(btrim(coalesce(p_reason, '')), '');
  if closed is not null and (
       reason is null
       or length(reason) < 6
       or array_length(regexp_split_to_array(reason, '\s+'), 1) < 2) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  ts := clock_timestamp();
  ms := floor(extract(epoch from ts) * 1000);

  select * into old_row from scores
   where event_id = p_event_id and category_id = p_category_id
     and contestant_id = p_contestant_id and judge_slot = p_judge_slot
   for update;
  had_row := found;

  if had_row then
    prev := old_row.previous_values;
    if prev is null then
      prev := (old_row.values - 'editedByOrganizer' - 'previousValues' - 'lastEditedAt')
              || jsonb_build_object('capturedAt', ms);
    end if;
  end if;

  final := (p_new_values - 'previousValues' - 'editedByOrganizer' - 'lastEditedAt')
           || jsonb_build_object('editedByOrganizer', true, 'lastEditedAt', ms);
  if prev is not null then
    final := final || jsonb_build_object('previousValues', prev);
  end if;
  if not had_row and (final->'submittedAt') is null then
    final := final || jsonb_build_object('submittedAt', ms);
  end if;

  insert into scores (event_id, category_id, contestant_id, judge_slot, values, total_only,
                      submitted_at, edited_by_organizer, last_edited_at, previous_values)
  values (p_event_id, p_category_id, p_contestant_id, p_judge_slot, final,
          case when had_row then old_row.total_only else coalesce((p_new_values->>'totalOnly') = 'true', false) end,
          ts, true, ts, prev)
  on conflict (event_id, category_id, contestant_id, judge_slot) do update set
    values = excluded.values,
    edited_by_organizer = true,
    last_edited_at = excluded.last_edited_at,
    previous_values = excluded.previous_values;

  insert into score_history (event_id, category_id, contestant_id, judge_slot, values, changed_at, changed_by, old_values, reason)
  values (p_event_id, p_category_id, p_contestant_id, p_judge_slot, final, ts, 'organizer',
          case when had_row then old_row.values end, reason);

  return jsonb_build_object('ok', true, 'values', final, 'closed', closed is not null);
end;
$$;

-- 6. Close judging. Idempotent: closing a closed event changes nothing and adds
--    no log row. Organizer PIN checked server-side through the shared limiter.
create or replace function public.close_event_scoring(p_event_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed  timestamptz;
  stored  text;
  pin_res jsonb;
  ts      timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('scoring:' || p_event_id, 0));
  select scoring_closed_at, organizer_pin into closed, stored
    from events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  pin_res := pin_attempt_register(p_event_id, 'organizer',
                                  stored is not null and p_pin is not null and stored = p_pin);
  if not (pin_res->>'ok')::boolean then
    return pin_res || jsonb_build_object(
      'error', case when (pin_res->>'locked')::boolean then 'locked' else 'bad_pin' end);
  end if;

  if closed is not null then
    return jsonb_build_object('ok', true, 'alreadyClosed', true, 'closedAt', closed);
  end if;

  ts := clock_timestamp();
  update events set scoring_closed_at = ts where id = p_event_id;
  insert into event_lock_log (event_id, action, actor, at) values (p_event_id, 'close', 'organizer', ts);
  return jsonb_build_object('ok', true, 'alreadyClosed', false, 'closedAt', ts);
end;
$$;

-- 7. Reopen. Admin only (service_role), idempotent, logged.
create or replace function public.reopen_event_scoring_admin(p_event_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed timestamptz;
  ts     timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('scoring:' || p_event_id, 0));
  select scoring_closed_at into closed from events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if closed is null then
    return jsonb_build_object('reopened', false);
  end if;
  ts := clock_timestamp();
  update events set scoring_closed_at = null where id = p_event_id;
  insert into event_lock_log (event_id, action, actor, at) values (p_event_id, 'reopen', 'admin', ts);
  return jsonb_build_object('reopened', true);
end;
$$;

-- 8. Tiny status read for the 15-second poll (the poll fetches scores, not the
--    whole config). Returns null for an unknown event.
create or replace function public.get_event_status(p_event_id text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object('scoringClosedAt', ev.scoring_closed_at)
    from events ev where ev.id = p_event_id;
$$;

-- 9. get_event_config: merged into the CURRENT live definition (read from the
--    database before editing). Only change: adds 'scoringClosedAt'.
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
    'scoringClosedAt', ev.scoring_closed_at,
    'judges', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.slot, 'realName', j.real_name, 'hasPin', j.pin is not null) order by j.id)
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

-- 10. list_events_admin: current live definition plus 'scoringClosedAt'.
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
    'scoringClosedAt', ev.scoring_closed_at,
    'lockedTargets', coalesce((
      select jsonb_agg(pa.target order by pa.target)
        from pin_attempts pa
       where pa.event_id = ev.id and pa.locked_until is not null and pa.locked_until > now()
    ), '[]'::jsonb)
  ) order by cl.name, ev.name), '[]'::jsonb)
  from events ev join clients cl on cl.id = ev.client_id;
$$;

-- 11. replace_event_config: CURRENT live definition (PIN-preservation and
--     resetPin logic untouched). Only change: the event row is already locked
--     FOR UPDATE, so a closed event is refused right after that lock.
create or replace function public.replace_event_config(p_event_id text, p_event jsonb, p_expected_rev integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_rev integer;
  closed_at timestamptz;
  new_rev integer;
  j jsonb;
  c jsonb;
  ct jsonb;
  old_pins jsonb;
  new_pin text;
  reset_targets text[] := '{}';
begin
  select rev, scoring_closed_at into current_rev, closed_at from events where id = p_event_id for update;
  if current_rev is null then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if closed_at is not null then
    raise exception 'judging_closed' using errcode = 'P0001';
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
      new_pin := old_pins->>(j->>'name');
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

-- 12. delete_event_own: CURRENT live definition. A closed event cannot be
--     deleted by this anon-callable function; an admin reopens it first.
create or replace function public.delete_event_own(p_event_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  closed_at timestamptz;
begin
  select scoring_closed_at into closed_at from events where id = p_event_id for update;
  if found and closed_at is not null then
    raise exception 'judging_closed' using errcode = 'P0001';
  end if;

  delete from score_history where event_id = p_event_id;
  delete from scores where event_id = p_event_id;
  delete from contestants where category_id in (select id from categories where event_id = p_event_id);
  delete from categories where event_id = p_event_id;
  delete from judges where event_id = p_event_id;
  delete from events where id = p_event_id;
end;
$$;

-- 13. Grants. New functions get default grants (PUBLIC + anon + authenticated
--     + service_role): revoke, then grant back only what each one needs.
--     CREATE OR REPLACE above preserved the existing ACLs of get_event_config,
--     replace_event_config, delete_event_own (anon-callable, as before) and
--     list_events_admin (service_role only).
revoke all on function public.submit_judge_score(text, text, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.retract_judge_score(text, text, text, text, jsonb)        from public, anon, authenticated;
revoke all on function public.organizer_correct_score(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.close_event_scoring(text, text)                            from public, anon, authenticated;
revoke all on function public.get_event_status(text)                                     from public, anon, authenticated;
revoke all on function public.reopen_event_scoring_admin(text)                           from public, anon, authenticated;

grant execute on function public.submit_judge_score(text, text, text, text, jsonb, boolean) to anon;
grant execute on function public.retract_judge_score(text, text, text, text, jsonb)        to anon;
grant execute on function public.organizer_correct_score(text, text, text, text, text, jsonb, text) to anon;
grant execute on function public.close_event_scoring(text, text)                            to anon;
grant execute on function public.get_event_status(text)                                     to anon;
grant execute on function public.reopen_event_scoring_admin(text)                           to service_role;

commit;
