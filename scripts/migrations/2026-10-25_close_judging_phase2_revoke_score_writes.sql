-- Close judging, phase 2 of 2: REVOKES DIRECT WRITES TO scores / score_history.
--
-- DO NOT RUN until ALL of these are true:
--   1. 2026-10-25_close_judging.sql (phase 1) is applied.
--   2. The new client (submit_judge_score / organizer_correct_score RPCs) is
--      live on main and verified on production.
--   3. No event is live. Every browser still running the OLD JavaScript, such
--      as a judge's phone with a tab left open, writes scores by direct REST
--      and will start failing ("Save failed", with a Retry that cannot
--      succeed) the moment this runs. Those tabs must reload.
--   4. Kirt has said go.
--
-- After this, the only way to change a score is through the security definer
-- RPCs, which refuse when an event is closed. SELECT is untouched: the Live
-- Tally, Judge Detail and print flows still read both tables directly.
--
-- Rollback (restores the old open behavior):
--   create policy "public write"  on public.scores for insert to public with check (true);
--   create policy "public update" on public.scores for update to public using (true);
--   create policy "public delete" on public.scores for delete to public using (true);
--   create policy "public write"  on public.score_history for insert to public with check (true);
--   grant insert, update, delete on public.scores to anon;
--   grant insert on public.score_history to anon;

begin;

drop policy if exists "public write"  on public.scores;
drop policy if exists "public update" on public.scores;
drop policy if exists "public delete" on public.scores;
drop policy if exists "public write"  on public.score_history;

revoke insert, update, delete, truncate, references, trigger on table public.scores        from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.score_history from public, anon, authenticated;

commit;
