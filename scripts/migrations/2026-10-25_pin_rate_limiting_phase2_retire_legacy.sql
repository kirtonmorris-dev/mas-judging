-- PIN rate limiting, phase 2 of 2: RETIRE THE OLD BEHAVIOR.
--
-- DO NOT RUN until the new client (check_organizer_pin_v2 / check_judge_pin /
-- set_judge_first_pin) is live on main and verified in production. This
-- migration breaks any browser tab still running the old client:
--   * the old Organizer PIN screen calls check_event_organizer_pin (dropped here)
--   * the old Judge PIN screen compares against the `pin` field of
--     get_event_config (removed here), so it would see "no PIN" for everyone
-- Run it outside a live event, and ask judges/organizers to reload first.
--
-- What it closes: until this runs, anyone with an event id can still read
-- every judge's plaintext PIN from get_event_config and can still brute-force
-- the organizer PIN through the unthrottled legacy RPC. Phase 1 alone does not
-- protect those two paths.

begin;

-- 1. get_event_config: stop returning plaintext PINs. `hasPin` (added in
--    phase 1) is all the client needs.
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

-- 2. replace_event_config: a payload `pin` is no longer honored at all. The
--    only ways a judge PIN changes are now set_judge_first_pin (only while
--    null) and an explicit "resetPin": true. Otherwise identical to phase 1.
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

-- 3. Retire the unthrottled legacy organizer check. Replaced by
--    check_organizer_pin_v2.
drop function if exists public.check_event_organizer_pin(text, text);

commit;
