import { state } from './state.js';

// crypto.randomUUID() rather than Math.random() -- new categories/contestants
// get an unguessable id, which matters now that scores/score_history stay
// directly queryable by id (see CONTEXT.md's isolation writeup). Existing
// rows keep their original short ids; this only affects newly created ones.
export function uid(){ return crypto.randomUUID(); }

export function scoreKey(eventId, catId, contestantId, judge){ return [eventId, catId, contestantId, judge].join('|'); }

export function currentEvent(){ return state.config.events.find(e=>e.id===state.eventId) || null; }

export function currentJudgeObj(ev){ return ev ? ev.judges.find(j=>j.name===state.judge) : null; }

export function judgeCategories(ev, judgeName){
  return ev.categories.filter(c => c.contestants.some(ct => ct.assignedJudges.includes(judgeName)));
}

export function catMaxTotal(cat){ return cat.criteria.reduce((s,c)=>s+(Number(c.max)||0),0); }

export function contestantTitle(cat, ct){ return cat.entryType==='group' ? (ct.band || '(unnamed band)') : (ct.masquerader || '(unnamed)'); }

export function contestantSubtitle(cat, ct){
  if(cat.entryType==='group') return ct.portrayal ? `"${ct.portrayal}"` : '';
  const parts = [];
  if(ct.band) parts.push(ct.band);
  if(ct.portrayal) parts.push(`"${ct.portrayal}"`);
  return parts.join(' \u00b7 ');
}

export function sortContestants(cat, contestants){
  return [...contestants].sort((a,b)=>{
    const an = ((cat.entryType==='group' ? a.band : a.masquerader) || '').toLowerCase();
    const bn = ((cat.entryType==='group' ? b.band : b.masquerader) || '').toLowerCase();
    return an.localeCompare(bn);
  });
}

export function entityLabel(ev, plural){
  if(!ev) return plural ? 'Contestants' : 'Contestant';
  return plural ? (ev.contestantLabelPlural || 'Bands') : (ev.contestantLabel || 'Band');
}

// True when the in-progress draft for `key` has criterion values that differ
// from what's actually saved (or, if nothing's saved yet, any nonzero value) --
// i.e. there's real unsubmitted work worth warning about losing.
export function draftHasUnsavedWork(key, cat){
  const draft = state.draft[key];
  if(!draft) return false;
  const saved = state.scores[key];
  return cat.criteria.some(c=>{
    const d = draft[c.key] || 0;
    const s = saved ? (saved[c.key] || 0) : 0;
    return d !== s;
  });
}

export function shortJudgeLabel(name){
  const m = /^Judge\s+(\d+)$/i.exec((name||'').trim());
  return m ? ('J'+m[1]) : name;
}

export function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

export function escapeAttr(s){ return escapeHtml(s); }

// Sign-off print timestamps live in localStorage, not the DB -- this is
// visibility only (was the sheet in this browser reprinted after an edit?),
// never an enforcement mechanism, so it doesn't need to be authoritative
// across devices.
const LAST_PRINTED_KEY = 'jds_last_printed';

function readLastPrintedMap(){
  try{ return JSON.parse(localStorage.getItem(LAST_PRINTED_KEY)) || {}; }
  catch(e){ return {}; }
}

export function getLastPrintedAt(eventId, categoryId){
  const map = readLastPrintedMap();
  return map[eventId + '|' + categoryId] || null;
}

export function setLastPrintedAt(eventId, categoryId){
  try{
    const map = readLastPrintedMap();
    map[eventId + '|' + categoryId] = Date.now();
    localStorage.setItem(LAST_PRINTED_KEY, JSON.stringify(map));
  }catch(e){ /* localStorage unavailable -- indicator just won't show, no functional impact */ }
}
