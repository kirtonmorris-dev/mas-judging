/* Judge D Show — Live Scoring for Every Competition
   © 2026 Immortelle Advisory Group. Built by Kirt Morris, Founder & Principal Consultant. */
import { fetchScores, loadAll, resolveEventSlug } from './api.js';
import { state } from './state.js';
import { initConnectionBanner } from './ui.js';
import { draftHasUnsavedWork } from './utils.js';
import { attachAdminGateHandlers, attachAdminHandlers, loadAdminData, renderAdmin, renderAdminGate } from './views/admin.js';
import { attachJudgeHandlers, renderJudgeMode } from './views/judge.js';
import { attachOrganizerHandlers, attachPinHandlers, renderOrganizer, renderPinGate } from './views/organizer.js';

const params = new URLSearchParams(location.search);
const isAdmin = params.get('admin') === '1';
const urlEventId = params.get('event');
const startMode = params.get('mode') === 'organizer' ? 'organizer' : 'judge';

export function setActiveTab(){
  document.getElementById('tabJudge').classList.toggle('active', state.mode==='judge');
  document.getElementById('tabOrganizer').classList.toggle('active', state.mode==='organizer');
}

export function render(){
  const app = document.getElementById('app');
  const container = document.querySelector('.container');

  if(isAdmin){
    container.classList.add('container-wide');
    app.innerHTML = state.adminUnlocked ? renderAdmin() : renderAdminGate();
    if(state.adminUnlocked){
      if(state.adminClients === null) loadAdminData();
      attachAdminHandlers();
    } else {
      attachAdminGateHandlers();
    }
    return;
  }

  if(container) container.classList.toggle('container-wide', state.mode === 'organizer');
  if(state.mode === 'judge'){
    app.innerHTML = renderJudgeMode();
    attachJudgeHandlers();
  } else {
    if(!state.orgUnlocked){
      app.innerHTML = renderPinGate();
      attachPinHandlers();
    } else {
      app.innerHTML = renderOrganizer();
      attachOrganizerHandlers();
    }
  }
}

function startEventSession(){
  // Warn before closing/reloading if any judge has an unsubmitted score draft --
  // state.draft lives only in memory, so this is the only thing standing between
  // a stray tab close and losing a half-entered score.
  window.onbeforeunload = (e)=>{
    if(!state.config) return;
    const hasUnsaved = Object.keys(state.draft).some(key=>{
      const [evId, catId] = key.split('|');
      const ev = state.config.events.find(e=>e.id===evId);
      const cat = ev && ev.categories.find(c=>c.id===catId);
      return cat && draftHasUnsavedWork(key, cat);
    });
    if(hasUnsaved){ e.preventDefault(); e.returnValue=''; return ''; }
  };

  initConnectionBanner();
  loadAll();

  setInterval(async ()=>{
    const orgShouldRefresh = state.mode==='organizer' && state.orgUnlocked && (state.orgTab==='tally' || state.orgTab==='detail');
    const judgeShouldRefresh = state.mode==='judge' && state.judgeUnlocked && !state.contestantId;
    if(orgShouldRefresh || judgeShouldRefresh){
      try{
        const sc = await fetchScores(state.eventId);
        if(sc){ state.scores = sc; render(); }
      }catch(e){ console.error('auto-refresh failed', e); }
    }
  }, 15000);
}

if(isAdmin){
  // The admin view is a fully separate entry point: no event binding, no
  // judge/organizer tab bar, no shared render path with the rest of the app.
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const modebar = document.querySelector('.modebar');
  if(modebar) modebar.style.display = 'none';
  render();
} else if(!urlEventId){
  document.getElementById('loadingMsg').textContent = 'This link does not point to a specific event. Ask your organizer for the correct link.';
} else {
  document.getElementById('tabJudge').onclick = ()=>{ state.mode='judge'; setActiveTab(); render(); };
  document.getElementById('tabOrganizer').onclick = ()=>{ state.mode='organizer'; setActiveTab(); render(); };
  state.mode = startMode;
  setActiveTab();

  // ?event= can be a memorable slug ("wiadca-junior") or, for links shared
  // before slugs existed, the raw internal event id -- try the slug lookup
  // first and fall back to treating the param as the real id.
  resolveEventSlug(urlEventId)
    .then(resolved => { state.eventId = resolved || urlEventId; })
    .catch(e => { console.error('slug resolution failed', e); state.eventId = urlEventId; })
    .finally(startEventSession);
}
