import { SUPABASE_KEY, SUPABASE_URL, normalizeConfig } from './constants.js';
import { render } from './main.js';
import { state } from './state.js';
import { showToast } from './ui.js';

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// Every read/write below is scoped to a single event_id -- never the whole
// database -- so a judge or organizer link for one event can never surface
// another event's (and therefore another client's) judges, PINs, contestants,
// or scores. The only exception is the separate admin.js code path, which
// exists specifically to see across events and is PIN-gated on its own.

// Public, harmless: turns a memorable slug (e.g. "wiadca-junior") into the
// real event id used everywhere else. Returns null if the slug is unknown --
// callers fall back to treating the original ?event= value as a raw id, so
// links shared before slugs existed keep working.
export async function resolveEventSlug(slug){
  const res = await fetch(`${REST}/rpc/resolve_event_slug`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug })
  });
  if(!res.ok) throw new Error('Supabase resolve_event_slug failed: ' + res.status);
  return await res.json();
}

// Error codes the database raises on purpose (see the close_judging migration).
// Surfaced as err.code so callers can react without string-matching responses.
const RPC_ERROR_CODES = ['judging_closed', 'reason_required', 'event_not_found', 'invalid_score'];

async function rpcJson(fn, body){
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const text = await res.text().catch(()=>'');
    const err = new Error(`Supabase ${fn} failed: ` + res.status);
    err.code = RPC_ERROR_CODES.find(c => text.includes(c)) || null;
    throw err;
  }
  return await res.json();
}

// PIN checks are server-side and rate limited: 5 wrong guesses lock that
// target (the organizer PIN, or one judge slot) for 5 minutes, per event --
// see the pin_rate_limiting migration. Each returns
// { ok, locked, retryAfterSeconds, attemptsLeft }; checkJudgePin can also
// return noPin:true (judge has not set a PIN yet) or unknown:true. The real
// PIN is never sent to the browser.
export async function checkOrganizerPin(eventId, pin){
  return rpcJson('check_organizer_pin_v2', { p_event_id: eventId, p_pin: pin });
}

export async function checkJudgePin(eventId, slot, pin){
  return rpcJson('check_judge_pin', { p_event_id: eventId, p_slot: slot, p_pin: pin });
}

// First login only: succeeds while the judge's PIN is still null.
// Returns { ok:true } or { ok:false, error: invalid_pin|pin_already_set|unknown_judge }.
export async function setJudgeFirstPin(eventId, slot, pin){
  return rpcJson('set_judge_first_pin', { p_event_id: eventId, p_slot: slot, p_pin: pin });
}

async function fetchEventConfig(eventId){
  const res = await fetch(`${REST}/rpc/get_event_config`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_id: eventId })
  });
  if(!res.ok) throw new Error('Supabase get_event_config failed: ' + res.status);
  return await res.json();
}

async function replaceEventConfig(eventId, eventData, expectedRev){
  const res = await fetch(`${REST}/rpc/replace_event_config`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_id: eventId, p_event: eventData, p_expected_rev: expectedRev ?? null })
  });
  if(!res.ok){
    const text = await res.text();
    if(text.includes('config_rev_conflict')){
      const err = new Error('config_rev_conflict');
      err.code = 'config_rev_conflict';
      throw err;
    }
    if(text.includes('judging_closed')){
      const err = new Error('judging_closed');
      err.code = 'judging_closed';
      throw err;
    }
    throw new Error('Supabase replace_event_config failed: ' + res.status);
  }
  return await res.json();
}

export async function deleteEventOwn(eventId){
  const res = await fetch(`${REST}/rpc/delete_event_own`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_id: eventId })
  });
  if(!res.ok){
    const text = await res.text().catch(()=>'');
    const err = new Error('Supabase delete_event_own failed: ' + res.status);
    err.code = text.includes('judging_closed') ? 'judging_closed' : null;
    throw err;
  }
}

export async function fetchScores(eventId){
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`,
    select: 'event_id,category_id,contestant_id,judge_slot,values'
  });
  const res = await fetch(`${REST}/scores?${params}`, { headers: AUTH_HEADERS });
  if(!res.ok) throw new Error('Supabase scores GET failed: ' + res.status);
  const rows = await res.json();
  const scores = {};
  rows.forEach(r => { scores[[r.event_id, r.category_id, r.contestant_id, r.judge_slot].join('|')] = r.values; });
  return scores;
}

async function fetchScoreEntry(eventId, categoryId, contestantId, judgeSlot){
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`, category_id: `eq.${categoryId}`, contestant_id: `eq.${contestantId}`, judge_slot: `eq.${judgeSlot}`,
    select: 'values'
  });
  const res = await fetch(`${REST}/scores?${params}`, { headers: AUTH_HEADERS });
  if(!res.ok) throw new Error('Supabase score GET failed: ' + res.status);
  const rows = await res.json();
  return rows.length ? rows[0].values : null;
}

// Lightweight per-category summary of the latest organizer-made correction,
// used only to decide whether to show an "edited since printed" badge --
// not the full change detail (see fetchScoreHistoryForCategory for that).
export async function fetchOrganizerEditSummary(eventId){
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`, changed_by: 'eq.organizer',
    select: 'category_id,changed_at', order: 'changed_at.desc'
  });
  const res = await fetch(`${REST}/score_history?${params}`, { headers: AUTH_HEADERS });
  if(!res.ok) throw new Error('Supabase score_history GET failed: ' + res.status);
  const rows = await res.json();
  const latestByCategory = {};
  rows.forEach(r=>{
    if(!(r.category_id in latestByCategory)) latestByCategory[r.category_id] = r.changed_at;
  });
  return latestByCategory;
}

export async function fetchScoreHistoryForCategory(eventId, categoryId){
  const params = new URLSearchParams({
    event_id: `eq.${eventId}`, category_id: `eq.${categoryId}`,
    select: 'contestant_id,judge_slot,values,old_values,reason,changed_at,changed_by', order: 'changed_at.desc', limit: '200'
  });
  const res = await fetch(`${REST}/score_history?${params}`, { headers: AUTH_HEADERS });
  if(!res.ok) throw new Error('Supabase score_history GET failed: ' + res.status);
  return await res.json();
}

export async function loadAll(){
  const eventId = state.eventId;
  let ev, cfgFetchOk = true;
  try{ ev = await fetchEventConfig(eventId); }
  catch(e){ console.error('config load failed', e); cfgFetchOk = false; }

  if(!cfgFetchOk || !ev || !ev.id){
    const loadingMsg = document.getElementById('loadingMsg');
    if(loadingMsg){
      loadingMsg.innerHTML = '';
      const msg = document.createElement('div');
      msg.textContent = cfgFetchOk
        ? 'This link does not point to a valid event. Ask your organizer for the correct link.'
        : 'Could not load — check your connection.';
      loadingMsg.appendChild(msg);
      if(!cfgFetchOk){
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn-outline-light btn-small';
        retryBtn.style.marginTop = '12px';
        retryBtn.textContent = 'Retry';
        retryBtn.onclick = ()=>{ loadingMsg.textContent = 'Loading scoresheet…'; loadAll(); };
        loadingMsg.appendChild(retryBtn);
      }
    }
    showToast(cfgFetchOk ? 'Invalid event link' : 'Could not reach the database — check connection', true);
    return;
  }

  // Judge PINs are checked server-side; never keep one in client state even
  // while the server still includes it during the rollout.
  (ev.judges || []).forEach(j=>{ delete j.pin; });
  const cfg = normalizeConfig({ events: [ev], _rev: ev._rev ?? 0 });
  state.config = cfg;

  let sc = null;
  try{ sc = await fetchScores(eventId); } catch(e){ console.error('scores load failed', e); }
  state.scores = sc || {};

  document.getElementById('loadingMsg').style.display='none';
  document.getElementById('app').style.display='block';
  render();
}

export async function saveConfig(){
  const ev = state.config.events[0];
  try{
    const newRev = await replaceEventConfig(ev.id, ev, ev._rev ?? state.config._rev);
    ev._rev = newRev;
    state.config._rev = newRev;
    return true;
  }catch(e){
    if(e && e.code === 'config_rev_conflict'){
      showToast('Setup was changed elsewhere — reload the page before editing again', true);
      return false;
    }
    if(e && e.code === 'judging_closed'){
      markJudgingClosed();
      showToast('Judging is closed, so setup is frozen. Ask your admin to reopen it.', true);
      render();
      return false;
    }
    console.error('save config failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveConfig();
      if(ok) render();
    });
    return false;
  }
}

// All score writes go through security definer RPCs (submit_judge_score,
// retract_judge_score, organizer_correct_score) that write the score row and
// its score_history row in one transaction and refuse once the event is closed.
// The browser no longer writes `scores` or `score_history` directly.

export function isJudgingClosed(){
  const ev = state.config && state.config.events[0];
  return !!(ev && ev.scoringClosedAt);
}

// Records that the server said judging is closed, so the UI flips to read-only
// immediately instead of waiting for the next poll.
function markJudgingClosed(){
  const ev = state.config && state.config.events[0];
  if(ev && !ev.scoringClosedAt) ev.scoringClosedAt = new Date().toISOString();
}

function splitKey(key){
  const [eventId, categoryId, contestantId, judgeSlot] = key.split('|');
  return { eventId, categoryId, contestantId, judgeSlot };
}

async function rpcSubmitScore(key, entry){
  const k = splitKey(key);
  return rpcJson('submit_judge_score', {
    p_event_id: k.eventId, p_category_id: k.categoryId, p_contestant_id: k.contestantId, p_judge_slot: k.judgeSlot,
    p_values: entry, p_total_only: !!entry.totalOnly
  });
}

async function rpcRetractScore(key, restoreEntry){
  const k = splitKey(key);
  return rpcJson('retract_judge_score', {
    p_event_id: k.eventId, p_category_id: k.categoryId, p_contestant_id: k.contestantId, p_judge_slot: k.judgeSlot,
    p_restore: restoreEntry || null
  });
}

function toastJudgingClosed(){
  showToast('Judging is closed. Your change was not saved.', true);
}

// Bulk helper kept for the one-time admin loaders (historicalLoaders.js):
// diff against the latest scores, then write each changed row through the
// RPCs. Fails (and writes nothing further) as soon as judging is closed.
export async function saveScoresMerge(mutateFn){
  const eventId = state.eventId;
  try{
    let latest = await fetchScores(eventId);
    if(!latest) latest = {};
    const before = {...latest};
    mutateFn(latest);

    const changed = Object.keys(latest).filter(key => latest[key] !== before[key]);
    const deleted = Object.keys(before).filter(k => !(k in latest));
    for(const key of changed) await rpcSubmitScore(key, latest[key]);
    for(const key of deleted) await rpcRetractScore(key, null);

    state.scores = latest;
    return true;
  }catch(e){
    if(e && e.code === 'judging_closed'){ markJudgingClosed(); toastJudgingClosed(); render(); return false; }
    console.error('saveScoresMerge failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveScoresMerge(mutateFn);
      if(ok) render();
    });
    return false;
  }
}

// A judge's own submission. On judging_closed the draft in state.draft is left
// untouched (never discarded), the UI flips to read-only, and false is returned.
export async function saveScoreEntry(key, entry){
  try{
    await rpcSubmitScore(key, entry);
    state.scores[key] = entry;
    return true;
  }catch(e){
    if(e && e.code === 'judging_closed'){
      markJudgingClosed();
      showToast('Judging is closed. Your score was not saved.', true);
      render();
      return false;
    }
    console.error('saveScoreEntry failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveScoreEntry(key, entry);
      if(ok) render();
    });
    return false;
  }
}

// The 6-second Undo on a judge's submission: put the previous entry back, or
// remove the score if it was a new one.
export async function undoScoreEntry(key, previousEntry){
  try{
    await rpcRetractScore(key, previousEntry);
    if(previousEntry) state.scores[key] = previousEntry;
    else delete state.scores[key];
    return true;
  }catch(e){
    if(e && e.code === 'judging_closed'){ markJudgingClosed(); toastJudgingClosed(); render(); return false; }
    console.error('undoScoreEntry failed', e);
    showToast('Undo failed — check connection', true);
    return false;
  }
}

// The organizer PIN was verified when this tab unlocked and is kept only in
// memory (state.orgPin, never persisted) so close/correct can re-verify it on
// the server. If it no longer matches (admin reset it) or the organizer is
// locked out, drop back to the PIN gate.
function handleOrganizerPinFailure(res){
  state.orgUnlocked = false;
  state.orgPin = null;
  showToast(res && res.locked
    ? 'Too many attempts. Try again in a few minutes.'
    : 'The organizer PIN was not accepted. Unlock again.', true);
  render();
}

// reason is required by the server once judging is closed (two words or more);
// optional before. Returns true on success.
export async function saveOrganizerScoreEdit(key, reason){
  const draft = state.orgEditDraft[key];
  if(!draft) return false;
  try{
    const { eventId, categoryId, contestantId, judgeSlot } = splitKey(key);
    let existing = await fetchScoreEntry(eventId, categoryId, contestantId, judgeSlot);
    if(!existing) existing = state.scores[key];
    let updated;
    if(!existing){
      updated = {...draft, judge: judgeSlot, event: eventId, category: categoryId, contestant: contestantId, submittedAt: Date.now()};
    } else {
      updated = {...existing};
      if(existing.totalOnly){
        const skip = ['totalOnly','judge','event','category','contestant','submittedAt','editedByOrganizer','previousValues','lastEditedAt'];
        const critKeys = Object.keys(existing).filter(k=>!skip.includes(k));
        const totalKey = critKeys.find(k=>existing[k]) || critKeys[0];
        if(totalKey){
          updated[totalKey] = draft.total;
          critKeys.forEach(k=>{ if(k!==totalKey) updated[k]=0; });
        }
      } else {
        Object.keys(draft).forEach(k=>{ updated[k] = draft[k]; });
      }
    }
    // The server owns editedByOrganizer / lastEditedAt / previousValues and
    // returns the final entry.
    const res = await rpcJson('organizer_correct_score', {
      p_event_id: eventId, p_pin: state.orgPin || '', p_category_id: categoryId, p_contestant_id: contestantId,
      p_judge_slot: judgeSlot, p_new_values: updated, p_reason: reason || null
    });
    if(!res.ok){ handleOrganizerPinFailure(res); return false; }
    state.scores[key] = res.values;
    delete state.organizerEditSummary[eventId];
    delete state.scoreHistoryCache[eventId + '|' + categoryId];
    return true;
  }catch(e){
    if(e && e.code === 'reason_required'){
      showToast('Enter a reason of at least two words.', true);
      return false;
    }
    console.error('saveOrganizerScoreEdit failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveOrganizerScoreEdit(key, reason);
      if(ok){
        delete state.orgEditDraft[key];
        state.orgEditKey = null;
      }
      render();
    });
    return false;
  }
}

// Organizer-only: closes judging for the whole event. The PIN is re-verified
// server-side. Returns { ok:true, closedAt, alreadyClosed } or a PIN failure.
export async function closeJudging(){
  const res = await rpcJson('close_event_scoring', { p_event_id: state.eventId, p_pin: state.orgPin || '' });
  if(res.ok){
    const ev = state.config.events[0];
    ev.scoringClosedAt = res.closedAt;
  } else {
    handleOrganizerPinFailure(res);
  }
  return res;
}

// Tiny status read used by the 15-second poll so every open screen learns that
// judging closed (or reopened) within one cycle. Returns the closed timestamp or null.
export async function fetchEventStatus(eventId){
  const res = await rpcJson('get_event_status', { p_event_id: eventId });
  return res ? (res.scoringClosedAt || null) : null;
}

// --- Admin-only calls (see views/admin.js). Every one of these goes through
// a /api/admin/* serverless function, not straight to Supabase -- the
// underlying RPCs (list_events_admin, list_clients_admin, create_client_admin,
// create_event_admin, delete_client_admin) had their `anon` EXECUTE grant
// revoked (see the lock_down_admin_rpcs migration), so the publishable key
// alone can no longer reach them. The server checks ADMIN_PIN and issues the
// token these calls carry -- see api/admin/auth.js and adminLogin() below.
// This replaced the old design where these RPCs were anon-callable and the
// admin PIN was only ever checked in the browser (a client-shipped constant
// gating nothing at the API level).
async function adminApi(path, body){
  const res = await fetch(`/api/admin/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if(res.status === 401){
    const err = new Error('admin_unauthorized');
    err.code = 'admin_unauthorized';
    throw err;
  }
  if(!res.ok){
    const data = await res.json().catch(()=>({}));
    const err = new Error(`admin/${path} failed: ` + res.status);
    if(data && data.error) err.code = data.error;
    throw err;
  }
  return await res.json();
}

export async function adminLogin(pin){
  const res = await fetch('/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if(!res.ok) return null;
  const data = await res.json();
  return data.token;
}

export async function adminListEvents(token){
  return adminApi('list-events', { token });
}

export async function adminListClients(token){
  return adminApi('list-clients', { token });
}

export async function adminDeleteClient(token, clientId){
  return adminApi('delete-client', { token, clientId });
}

// fields: { name, contactName, contactEmail, contactPhone }
export async function adminCreateClient(token, fields){
  return adminApi('create-client', { token, ...fields });
}

export async function adminUpdateClient(token, clientId, fields){
  return adminApi('update-client', { token, clientId, ...fields });
}

// contact (optional): { eventContactName, eventContactEmail, eventContactPhone }
export async function adminCreateEvent(token, clientId, name, slug, contact){
  return adminApi('create-event', { token, clientId, name, slug, ...(contact || {}) });
}

// Edits only the three event-day contact fields; empty string clears to NULL.
export async function adminUpdateEventContact(token, eventId, contact){
  return adminApi('update-event-contact', { token, eventId, ...contact });
}

export async function adminResetOrganizerPin(token, eventId){
  return adminApi('reset-organizer-pin', { token, eventId });
}

// Reopens judging for a closed event. Admin only; logged server-side.
export async function adminReopenScoring(token, eventId){
  return adminApi('reopen-scoring', { token, eventId });
}

// Clears the organizer lockout and every judge lockout for one event.
export async function adminUnlockPins(token, eventId){
  return adminApi('unlock-pin', { token, eventId });
}
