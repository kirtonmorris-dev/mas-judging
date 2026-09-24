import { SUPABASE_KEY, SUPABASE_URL, normalizeConfig } from './constants.js';
import { render } from './main.js';
import { state } from './state.js';
import { renderPennants, showToast } from './ui.js';

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
  if(!res.ok) throw new Error('Supabase delete_event_own failed: ' + res.status);
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

function scoreRowFromEntry(eventId, categoryId, contestantId, judgeSlot, entry){
  return {
    event_id: eventId, category_id: categoryId, contestant_id: contestantId, judge_slot: judgeSlot,
    values: entry,
    total_only: !!entry.totalOnly,
    submitted_at: new Date(entry.submittedAt || Date.now()).toISOString(),
    edited_by_organizer: !!entry.editedByOrganizer,
    last_edited_at: entry.lastEditedAt ? new Date(entry.lastEditedAt).toISOString() : null,
    previous_values: entry.previousValues || null,
  };
}

async function upsertScoreRows(rows){
  if(!rows.length) return;
  const res = await fetch(`${REST}/scores?on_conflict=event_id,category_id,contestant_id,judge_slot`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if(!res.ok) throw new Error('Supabase scores upsert failed: ' + res.status);
}

async function deleteScoreRows(keys){
  if(!keys.length) return;
  const clauses = keys.map(key => {
    const [eventId, categoryId, contestantId, judgeSlot] = key.split('|');
    return `and(event_id.eq.${eventId},category_id.eq.${categoryId},contestant_id.eq.${contestantId},judge_slot.eq.${judgeSlot})`;
  });
  const res = await fetch(`${REST}/scores?or=(${clauses.join(',')})`, {
    method: 'DELETE',
    headers: { ...AUTH_HEADERS, Prefer: 'return=minimal' }
  });
  if(!res.ok) throw new Error('Supabase scores delete failed: ' + res.status);
}

// Best-effort append-only audit log — one row per changed score, not a
// capped whole-snapshot backup, so it never needs to discard old entries.
async function logScoreHistory(rows){
  if(!rows.length) return;
  const body = rows.map(r => ({
    event_id: r.event_id, category_id: r.category_id, contestant_id: r.contestant_id, judge_slot: r.judge_slot,
    values: r.values, changed_by: r.edited_by_organizer ? 'organizer' : 'judge'
  }));
  await fetch(`${REST}/score_history`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
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
    select: 'contestant_id,judge_slot,values,changed_at,changed_by', order: 'changed_at.desc', limit: '200'
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

  const cfg = normalizeConfig({ events: [ev], _rev: ev._rev ?? 0 });
  state.config = cfg;

  let sc = null;
  try{ sc = await fetchScores(eventId); } catch(e){ console.error('scores load failed', e); }
  state.scores = sc || {};

  document.getElementById('loadingMsg').style.display='none';
  document.getElementById('app').style.display='block';
  renderPennants();
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
    console.error('save config failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveConfig();
      if(ok) render();
    });
    return false;
  }
}

export async function saveScoresMerge(mutateFn){
  const eventId = state.eventId;
  try{
    let latest = await fetchScores(eventId);
    if(!latest) latest = {};
    const before = {...latest};
    mutateFn(latest);

    const upsertRows = [];
    Object.keys(latest).forEach(key => {
      if(latest[key] !== before[key]){
        const [eId, categoryId, contestantId, judgeSlot] = key.split('|');
        upsertRows.push(scoreRowFromEntry(eId, categoryId, contestantId, judgeSlot, latest[key]));
      }
    });
    const deleteKeys = Object.keys(before).filter(k => !(k in latest));

    await upsertScoreRows(upsertRows);
    await deleteScoreRows(deleteKeys);

    state.scores = latest;
    logScoreHistory(upsertRows).catch(e=>console.error('history backup failed', e));
    return true;
  }catch(e){
    console.error('saveScoresMerge failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveScoresMerge(mutateFn);
      if(ok) render();
    });
    return false;
  }
}

export async function saveScoreEntry(key, entry){
  try{
    const [eventId, categoryId, contestantId, judgeSlot] = key.split('|');
    const row = scoreRowFromEntry(eventId, categoryId, contestantId, judgeSlot, entry);
    await upsertScoreRows([row]);
    state.scores[key] = entry;
    logScoreHistory([row]).catch(e=>console.error('history backup failed', e));
    return true;
  }catch(e){
    console.error('saveScoreEntry failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveScoreEntry(key, entry);
      if(ok) render();
    });
    return false;
  }
}

export async function saveOrganizerScoreEdit(key){
  const draft = state.orgEditDraft[key];
  if(!draft) return false;
  try{
    const [eventId, categoryId, contestantId, judgeSlot] = key.split('|');
    let existing = await fetchScoreEntry(eventId, categoryId, contestantId, judgeSlot);
    if(!existing) existing = state.scores[key];
    let updated;
    if(!existing){
      updated = {...draft, judge: judgeSlot, event: eventId, category: categoryId, contestant: contestantId, submittedAt: Date.now(), editedByOrganizer: true};
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
      if(!existing.previousValues){
        const skip = ['editedByOrganizer','previousValues','lastEditedAt'];
        const originalSnapshot = {};
        Object.keys(existing).forEach(k=>{ if(!skip.includes(k)) originalSnapshot[k] = existing[k]; });
        updated.previousValues = {...originalSnapshot, capturedAt: Date.now()};
      }
      updated.editedByOrganizer = true;
      updated.lastEditedAt = Date.now();
    }
    const row = scoreRowFromEntry(eventId, categoryId, contestantId, judgeSlot, updated);
    await upsertScoreRows([row]);
    state.scores[key] = updated;
    logScoreHistory([row]).catch(e=>console.error('history backup failed', e));
    return true;
  }catch(e){
    console.error('saveOrganizerScoreEdit failed', e);
    showToast('Save failed — check connection', true, async ()=>{
      const ok = await saveOrganizerScoreEdit(key);
      if(ok){
        delete state.orgEditDraft[key];
        state.orgEditKey = null;
      }
      render();
    });
    return false;
  }
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

export async function adminCreateClient(token, name){
  return adminApi('create-client', { token, name });
}

export async function adminCreateEvent(token, clientId, name, slug){
  return adminApi('create-event', { token, clientId, name, slug });
}
