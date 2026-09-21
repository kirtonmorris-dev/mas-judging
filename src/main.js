/* Judge D Show — Live Scoring for Every Competition
   © 2026 Immortelle Advisory Group. Built by Kirt Morris, Founder & Principal Consultant. */
import { fetchScores, loadAll } from './api.js';
import { state } from './state.js';
import { initConnectionBanner } from './ui.js';
import { draftHasUnsavedWork } from './utils.js';
import { attachJudgeHandlers, renderJudgeMode } from './views/judge.js';
import { attachOrganizerHandlers, attachPinHandlers, renderOrganizer, renderPinGate } from './views/organizer.js';

export function setActiveTab(){
  document.getElementById('tabJudge').classList.toggle('active', state.mode==='judge');
  document.getElementById('tabOrganizer').classList.toggle('active', state.mode==='organizer');
}

export function render(){
  const app = document.getElementById('app');
  const container = document.querySelector('.container');
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

document.getElementById('tabJudge').onclick = ()=>{ state.mode='judge'; setActiveTab(); render(); };
document.getElementById('tabOrganizer').onclick = ()=>{ state.mode='organizer'; setActiveTab(); render(); };

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
      const sc = await fetchScores();
      if(sc){ state.scores = sc; render(); }
    }catch(e){ console.error('auto-refresh failed', e); }
  }
}, 15000);
