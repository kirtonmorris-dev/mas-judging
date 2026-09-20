import { DEFAULT_CONFIG, SUPABASE_KEY, SUPABASE_URL, TABLE, normalizeConfig } from './constants.js';
import { render } from './main.js';
import { state } from './state.js';
import { renderPennants, showToast } from './ui.js';

export async function sbGet(id){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=data`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if(!res.ok) throw new Error('Supabase GET failed: ' + res.status);
  const rows = await res.json();
  return rows.length ? rows[0].data : null;
}

export async function sbSet(id, data){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ id, data }])
  });
  if(!res.ok) throw new Error('Supabase POST failed: ' + res.status);
}

export async function loadAll(){
  try{
    let cfg = null;
    try{ cfg = await sbGet('config'); } catch(e){ console.error(e); }
    if(!cfg){ cfg = DEFAULT_CONFIG; }
    cfg = normalizeConfig(cfg);
    state.config = cfg;
    await sbSet('config', cfg);
    if(!state.eventId && cfg.events.length) state.eventId = cfg.events[0].id;

    let sc = null;
    try{ sc = await sbGet('scores'); } catch(e){ console.error(e); }
    state.scores = sc || {};
  }catch(e){
    console.error('load error', e);
    state.config = normalizeConfig(DEFAULT_CONFIG);
    state.eventId = state.config.events[0].id;
    state.scores = {};
    showToast('Could not reach the database — check connection', true);
  }
  document.getElementById('loadingMsg').style.display='none';
  document.getElementById('app').style.display='block';
  renderPennants();
  render();
}

export async function saveConfig(){
  try{ await sbSet('config', state.config); return true; }
  catch(e){ console.error('save config failed', e); showToast('Save failed — check connection', true); return false; }
}

export async function saveScores(){
  try{ await sbSet('scores', state.scores); return true; }
  catch(e){ console.error('save scores failed', e); showToast('Save failed — check connection, then try again', true); return false; }
}

export async function backupScoresHistory(snapshot){
  let history = null;
  try{ history = await sbGet('scores_history'); }catch(e){ /* ignore, best-effort */ }
  if(!Array.isArray(history)) history = [];
  history.push({ savedAt: Date.now(), data: snapshot });
  if(history.length > 10) history = history.slice(history.length - 10);
  await sbSet('scores_history', history);
}

export async function saveScoreEntry(key, entry){
  try{
    let latest = null;
    try{ latest = await sbGet('scores'); }catch(e){ console.error(e); }
    if(!latest) latest = {};
    latest[key] = entry;
    await sbSet('scores', latest);
    state.scores = latest;
    backupScoresHistory(latest).catch(e=>console.error('history backup failed', e));
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
    let latest = null;
    try{ latest = await sbGet('scores'); }catch(e){ console.error(e); }
    if(!latest) latest = {};
    const existing = latest[key] || state.scores[key];
    let updated;
    if(!existing){
      const [eventId, categoryId, contestantId, judgeName] = key.split('|');
      updated = {...draft, judge: judgeName, event: eventId, category: categoryId, contestant: contestantId, submittedAt: Date.now(), editedByOrganizer: true};
      latest[key] = updated;
      await sbSet('scores', latest);
      state.scores = latest;
      backupScoresHistory(latest).catch(e=>console.error('history backup failed', e));
      return true;
    }
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
    latest[key] = updated;
    await sbSet('scores', latest);
    state.scores = latest;
    backupScoresHistory(latest).catch(e=>console.error('history backup failed', e));
    return true;
  }catch(e){
    console.error('saveOrganizerScoreEdit failed', e);
    showToast('Save failed — check connection, then try again', true);
    return false;
  }
}
