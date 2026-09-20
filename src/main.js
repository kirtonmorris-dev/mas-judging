/* Mas Judging — Live Carnival Scoring
   © 2026 Immortelle Advisory Group. Built by Kirt Morris, Founder & Principal Consultant. */
import { loadAll, sbGet } from './api.js';
import { state } from './state.js';
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

loadAll();

setInterval(async ()=>{
  const orgShouldRefresh = state.mode==='organizer' && state.orgUnlocked && (state.orgTab==='tally' || state.orgTab==='detail');
  const judgeShouldRefresh = state.mode==='judge' && state.judgeUnlocked && !state.contestantId;
  if(orgShouldRefresh || judgeShouldRefresh){
    try{
      const sc = await sbGet('scores');
      if(sc){ state.scores = sc; render(); }
    }catch(e){ console.error('auto-refresh failed', e); }
  }
}, 15000);
