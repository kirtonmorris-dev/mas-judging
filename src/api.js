import { DEFAULT_CONFIG, SUPABASE_KEY, SUPABASE_URL, normalizeConfig } from './constants.js';
import { render } from './main.js';
import { state } from './state.js';
import { renderPennants, showToast } from './ui.js';

const REST = `${SUPABASE_URL}/rest/v1`;
const AUTH_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function fetchConfig(){
  const res = await fetch(`${REST}/rpc/get_config`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if(!res.ok) throw new Error('Supabase get_config failed: ' + res.status);
  return await res.json();
}

async function replaceConfig(events, expectedRev){
  const res = await fetch(`${REST}/rpc/replace_config`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_events: events, p_expected_rev: expectedRev ?? null })
  });
  if(!res.ok){
    const text = await res.text();
    if(text.includes('config_rev_conflict')){
      const err = new Error('config_rev_conflict');
      err.code = 'config_rev_conflict';
      throw err;
    }
    throw new Error('Supabase replace_config failed: ' + res.status);
  }
  return await res.json();
}

export async function fetchScores(){
  const res = await fetch(`${REST}/scores?select=event_id,category_id,contestant_id,judge_slot,values`, { headers: AUTH_HEADERS });
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

export async function loadAll(){
  let cfg, cfgFetchOk = true;
  try{ cfg = await fetchConfig(); }
  catch(e){ console.error('config load failed', e); cfgFetchOk = false; }

  if(!cfgFetchOk){
    const loadingMsg = document.getElementById('loadingMsg');
    if(loadingMsg) loadingMsg.textContent = 'Could not load — check your connection and reload the page.';
    showToast('Could not reach the database — check connection and reload', true);
    return;
  }

  if(!cfg || !Array.isArray(cfg.events) || !cfg.events.length){
    cfg = { ...DEFAULT_CONFIG, _rev: (cfg && cfg._rev) ?? 0 };
  }
  cfg = normalizeConfig(cfg);
  state.config = cfg;
  if(!state.eventId && cfg.events.length) state.eventId = cfg.events[0].id;

  let sc = null;
  try{ sc = await fetchScores(); } catch(e){ console.error('scores load failed', e); }
  state.scores = sc || {};

  document.getElementById('loadingMsg').style.display='none';
  document.getElementById('app').style.display='block';
  renderPennants();
  render();
}

export async function saveConfig(){
  try{
    const newRev = await replaceConfig(state.config.events, state.config._rev);
    state.config._rev = newRev;
    return true;
  }catch(e){
    if(e && e.code === 'config_rev_conflict'){
      showToast('Setup was changed elsewhere — reload the page before editing again', true);
      return false;
    }
    console.error('save config failed', e); showToast('Save failed — check connection', true); return false;
  }
}

export async function saveScoresMerge(mutateFn){
  try{
    let latest = await fetchScores();
    if(!latest) latest = {};
    const before = {...latest};
    mutateFn(latest);

    const upsertRows = [];
    Object.keys(latest).forEach(key => {
      if(latest[key] !== before[key]){
        const [eventId, categoryId, contestantId, judgeSlot] = key.split('|');
        upsertRows.push(scoreRowFromEntry(eventId, categoryId, contestantId, judgeSlot, latest[key]));
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
    showToast('Save failed — check connection, then try again', true);
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
    showToast('Save failed — check connection, then try again', true);
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
    showToast('Save failed — check connection, then try again', true);
    return false;
  }
}
