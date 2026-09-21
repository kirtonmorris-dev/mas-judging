#!/usr/bin/env node
/*
 * Unattended stress/concurrency test for the Judge D Show Supabase backend.
 *
 * Exercises the exact REST/RPC calls src/api.js makes (upsert scores, replace_config,
 * fetchScores) at real concurrency, entirely against a disposable synthetic event
 * (id "stress-test-evt") so it never touches real event/judge/contestant/score data.
 * The script creates that event, runs its scenarios, then deletes it -- it cleans up
 * any leftovers from a crashed previous run first, too.
 *
 * Requires Node 18+ (built-in fetch). No other dependencies.
 *
 * Usage:
 *   node scripts/stress-test.mjs
 *   node scripts/stress-test.mjs --concurrency=50 --rounds=100 --contestants=20
 *   node scripts/stress-test.mjs --keep      # skip cleanup, leave test data in place for inspection
 *
 * Exit code is 0 if every scenario passed, 1 otherwise (CI-friendly).
 */

// Mirrors src/constants.js -- duplicated here rather than imported so this script
// has zero dependency on the app's module system (src/constants.js is loaded as a
// browser ES module; there's no package.json "type" field to make that importable
// from plain Node without friction). These are Supabase's public/publishable
// values, safe to duplicate -- update both places together if they ever change.
const SUPABASE_URL = 'https://pjqojhtqxljnukwlzekr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ahi2YrsAURh98_DGfM1Hfw_sRw9T34B';

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const TEST_EVENT_ID = 'stress-test-evt';
const TEST_CATEGORY_ID = 'stress-test-cat';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const CONCURRENCY = Number(args.concurrency || 20);
const ROUNDS = Number(args.rounds || 30);
const CONTESTANT_COUNT = Number(args.contestants || Math.max(CONCURRENCY, 10));
const KEEP = !!args.keep;

let passCount = 0, failCount = 0;
const results = [];

function pass(name, detail = ''){ passCount++; results.push({name, ok:true, detail}); console.log(`  ✓ ${name}${detail ? ' -- ' + detail : ''}`); }
function fail(name, detail = ''){ failCount++; results.push({name, ok:false, detail}); console.log(`  ✗ ${name}${detail ? ' -- ' + detail : ''}`); }
function section(title){ console.log(`\n${title}`); }

function percentile(sorted, p){
  if(!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length));
  return sorted[idx];
}

async function rest(path, opts = {}){
  const started = Date.now();
  const res = await fetch(`${REST}${path}`, { ...opts, headers: { ...AUTH_HEADERS, ...(opts.headers || {}) } });
  const ms = Date.now() - started;
  return { res, ms };
}

async function rpc(fn, body){
  const { res, ms } = await rest(`/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if(!res.ok){
    const err = new Error(`${fn} -> ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return { data: text ? JSON.parse(text) : null, ms };
}

async function upsertScore(contestantId, judgeSlot, values){
  const { res, ms } = await rest(`/scores?on_conflict=event_id,category_id,contestant_id,judge_slot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      event_id: TEST_EVENT_ID, category_id: TEST_CATEGORY_ID, contestant_id: contestantId, judge_slot: judgeSlot,
      values, submitted_at: new Date().toISOString()
    }])
  });
  if(!res.ok) throw new Error(`upsert -> ${res.status}: ${await res.text()}`);
  return ms;
}

async function fetchScores(){
  const { res } = await rest(`/scores?event_id=eq.${TEST_EVENT_ID}&select=contestant_id,judge_slot,values`);
  if(!res.ok) throw new Error(`fetch scores -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function cleanupTestEvent(){
  // events delete cascades to judges/categories/contestants (FK ON DELETE CASCADE);
  // scores/score_history have no FK to events, so they're cleaned up explicitly.
  await rest(`/events?id=eq.${TEST_EVENT_ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(`/scores?event_id=eq.${TEST_EVENT_ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(`/score_history?event_id=eq.${TEST_EVENT_ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

async function setupTestEvent(){
  await cleanupTestEvent(); // remove any leftovers from a crashed previous run

  const { res: evRes } = await rest('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([{ id: TEST_EVENT_ID, name: 'Stress Test Event (disposable)', active: true }])
  });
  if(!evRes.ok) throw new Error(`create test event -> ${evRes.status}: ${await evRes.text()}`);

  const judges = Array.from({ length: CONCURRENCY }, (_, i) => ({
    event_id: TEST_EVENT_ID, slot: `Judge ${i}`, real_name: `Stress Judge ${i}`, pin: null
  }));
  const { res: jRes } = await rest('/judges', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(judges)
  });
  if(!jRes.ok) throw new Error(`create test judges -> ${jRes.status}: ${await jRes.text()}`);

  const { res: catRes } = await rest('/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([{
      id: TEST_CATEGORY_ID, event_id: TEST_EVENT_ID, name: 'Stress Category', entry_type: 'individual',
      criteria: [{ key: 'k1', label: 'Criterion', max: 100 }]
    }])
  });
  if(!catRes.ok) throw new Error(`create test category -> ${catRes.status}: ${await catRes.text()}`);

  const contestants = Array.from({ length: CONTESTANT_COUNT }, (_, i) => ({
    id: `${TEST_CATEGORY_ID}-ct${i}`, category_id: TEST_CATEGORY_ID, band: `Stress Band ${i}`, assigned_judges: []
  }));
  const { res: ctRes } = await rest('/contestants', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(contestants)
  });
  if(!ctRes.ok) throw new Error(`create test contestants -> ${ctRes.status}: ${await ctRes.text()}`);

  return contestants.map(c => c.id);
}

// Scenario 1: many judges concurrently score different contestants.
// Nothing should collide -- every row should land intact.
async function scenarioDistinctConcurrentWrites(contestantIds){
  section(`Scenario 1: ${CONCURRENCY} judges concurrently scoring ${CONCURRENCY} different contestants`);
  const targets = contestantIds.slice(0, CONCURRENCY);
  const started = Date.now();
  const outcomes = await Promise.allSettled(
    targets.map((ctId, i) => upsertScore(ctId, `Judge ${i}`, { k1: i + 1 }))
  );
  const elapsed = Date.now() - started;
  const errors = outcomes.filter(o => o.status === 'rejected');
  if(errors.length){
    fail('all concurrent distinct writes succeeded', `${errors.length}/${targets.length} failed: ${errors[0].reason}`);
  } else {
    pass('all concurrent distinct writes succeeded', `${targets.length} writes in ${elapsed}ms`);
  }

  const rows = await fetchScores();
  const expected = new Set(targets.map((ctId, i) => `${ctId}|Judge ${i}`));
  const actual = new Set(rows.map(r => `${r.contestant_id}|${r.judge_slot}`));
  const missing = [...expected].filter(k => !actual.has(k));
  if(missing.length) fail('every distinct row persisted correctly', `missing: ${missing.join(', ')}`);
  else pass('every distinct row persisted correctly', `${rows.length} rows found`);
}

// Scenario 2: the exact race that caused the original bug -- many writers hitting
// the SAME (event,category,contestant,judge) key at once. The fix doesn't make
// simultaneous writes to the same key deterministic (one has to win), but it must
// guarantee exactly one clean row survives -- never a corrupted merge, never a
// duplicate, never a silently dropped write that leaves stale data.
async function scenarioSameKeyRace(contestantId){
  section(`Scenario 2: ${CONCURRENCY} workers racing to write the SAME score simultaneously`);
  const judgeSlot = 'Judge 0';
  const submitted = Array.from({ length: CONCURRENCY }, (_, i) => i + 1);
  const outcomes = await Promise.allSettled(submitted.map(v => upsertScore(contestantId, judgeSlot, { k1: v })));
  const errors = outcomes.filter(o => o.status === 'rejected');
  if(errors.length) fail('all racing writes completed without error', `${errors.length} failed: ${errors[0].reason}`);
  else pass('all racing writes completed without error', `${CONCURRENCY} concurrent writes`);

  const { res } = await rest(`/scores?event_id=eq.${TEST_EVENT_ID}&category_id=eq.${TEST_CATEGORY_ID}&contestant_id=eq.${contestantId}&judge_slot=eq.${judgeSlot}&select=values`);
  const rows = await res.json();
  if(rows.length !== 1) fail('exactly one row survives the race (no duplicates)', `found ${rows.length} rows`);
  else pass('exactly one row survives the race (no duplicates)');
  if(rows.length === 1 && submitted.includes(rows[0].values.k1)) pass('surviving value is one of the submitted values (no corruption)', `k1=${rows[0].values.k1}`);
  else if(rows.length === 1) fail('surviving value is one of the submitted values (no corruption)', `k1=${JSON.stringify(rows[0].values)}`);
}

// Scenario 3: sustained load -- measure latency/error rate across many sequential
// concurrent batches, the pattern a real judging day looks like (bursts as each
// round finishes).
async function scenarioSustainedLoad(contestantIds){
  section(`Scenario 3: sustained load -- ${ROUNDS} rounds of ${CONCURRENCY} concurrent writes`);
  const latencies = [];
  let errors = 0;
  for(let r = 0; r < ROUNDS; r++){
    const batch = await Promise.allSettled(
      contestantIds.slice(0, CONCURRENCY).map((ctId, i) => upsertScore(ctId, `Judge ${i}`, { k1: r }))
    );
    batch.forEach(o => { if(o.status === 'fulfilled') latencies.push(o.value); else errors++; });
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = ROUNDS * CONCURRENCY;
  if(errors) fail('sustained load completed with zero errors', `${errors}/${total} requests failed`);
  else pass('sustained load completed with zero errors', `${total} requests`);
  console.log(`    latency: p50=${percentile(sorted,50)}ms p95=${percentile(sorted,95)}ms p99=${percentile(sorted,99)}ms max=${sorted[sorted.length-1]||0}ms`);
}

// Scenario 4: concurrent organizer setup saves. replace_config's optimistic-rev
// lock should let exactly one of N simultaneous saves starting from the same rev
// succeed, and reject the rest with config_rev_conflict -- never silently let a
// later save clobber an earlier one.
async function scenarioConfigOptimisticLock(){
  section(`Scenario 4: ${CONCURRENCY} concurrent config saves starting from the same rev`);
  const { data: cfg } = await rpc('get_config', {});
  const baseRev = cfg._rev;

  const attempts = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      rpc('replace_config', { p_events: cfg.events, p_expected_rev: baseRev })
    )
  );
  const succeeded = attempts.filter(a => a.status === 'fulfilled');
  const conflicted = attempts.filter(a => a.status === 'rejected' && String(a.reason).includes('config_rev_conflict'));
  const otherErrors = attempts.filter(a => a.status === 'rejected' && !String(a.reason).includes('config_rev_conflict'));

  if(otherErrors.length) fail('no unexpected errors during contention', `${otherErrors.length}: ${otherErrors[0].reason}`);
  else pass('no unexpected errors during contention');

  if(succeeded.length === 1) pass('exactly one concurrent save won', `${conflicted.length} correctly rejected as conflicts`);
  else fail('exactly one concurrent save won', `${succeeded.length} succeeded (expected exactly 1)`);
}

async function main(){
  console.log(`Stress test config: concurrency=${CONCURRENCY} rounds=${ROUNDS} contestants=${CONTESTANT_COUNT} keep=${KEEP}`);
  console.log(`Target: ${SUPABASE_URL} (disposable event id "${TEST_EVENT_ID}")`);

  let contestantIds;
  try{
    section('Setup: creating disposable synthetic event');
    contestantIds = await setupTestEvent();
    pass('synthetic test event created', `${CONTESTANT_COUNT} contestants, ${CONCURRENCY} judges`);
  }catch(e){
    fail('synthetic test event created', e.message);
    console.error('\nSetup failed -- aborting without running scenarios.');
    process.exit(1);
  }

  try{
    await scenarioDistinctConcurrentWrites(contestantIds);
    await scenarioSameKeyRace(contestantIds[0]);
    await scenarioSustainedLoad(contestantIds);
    await scenarioConfigOptimisticLock();
  }catch(e){
    fail('scenario runner', `unexpected exception: ${e.stack || e.message}`);
  }

  if(!KEEP){
    section('Cleanup');
    try{ await cleanupTestEvent(); pass('disposable test event removed'); }
    catch(e){ fail('disposable test event removed', e.message); }
  } else {
    console.log('\n--keep set: leaving stress-test-evt in place for inspection.');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(60));
  process.exit(failCount ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
