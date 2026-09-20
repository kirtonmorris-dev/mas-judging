import { saveConfig, saveScoreEntry } from '../api.js';
import { render } from '../main.js';
import { printMyScores } from '../print.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';
import { catMaxTotal, contestantSubtitle, contestantTitle, currentEvent, currentJudgeObj, escapeAttr, escapeHtml, judgeCategories, scoreKey, sortContestants } from '../utils.js';
import { renderEventPicker } from '../views/shared.js';

export function renderJudgeMode(){
  const cfg = state.config;
  let html = renderEventPicker(false);
  const ev = currentEvent();
  if(!ev) return html + '<div class="empty">No events yet. Ask the organizer to add one.</div>';

  html += '<div class="card">';
  html += '<label>Your name</label>';
  if(ev.judges.length === 0){
    html += '<div class="empty">No judges set up yet for this event. Ask the organizer to add you in Setup.</div>';
    html += '</div>';
    return html;
  }
  html += '<select id="judgeSelect">';
  html += '<option value="">Select your judge number&hellip;</option>';
  ev.judges.forEach(j=>{
    html += `<option value="${escapeAttr(j.name)}" ${state.judge===j.name?'selected':''}>${escapeHtml(j.name)}</option>`;
  });
  html += '</select>';
  html += '</div>';

  if(!state.judge) return html + '<div class="empty">Pick or add your name to start scoring.</div>';

  const judgeObj = currentJudgeObj(ev);
  if(!judgeObj) return html + '<div class="empty">That judge is no longer on this event.</div>';

  if(judgeObj.pin === null || judgeObj.pin === undefined){
    html += `<div class="card">
      <div class="section-title" style="color:var(--ink);">Set your PIN</div>
      <div class="pin-explain">Create a 4-digit PIN for <b>${escapeHtml(judgeObj.name)}</b>. You'll enter it each time you pick this name, so no one accidentally scores as you.</div>
      <input type="tel" inputmode="numeric" maxlength="4" id="pinSetInput" placeholder="4-digit PIN" style="text-align:center; letter-spacing:0.4em; font-size:1.3rem;">
      <button class="btn btn-primary" id="pinSetBtn">Set PIN</button>
      <div id="pinSetErr" class="err" style="display:none; margin-top:10px;">Enter exactly 4 digits.</div>
    </div>`;
    return html;
  }

  if(!state.judgeUnlocked){
    html += `<div class="card">
      <div class="section-title" style="color:var(--ink);">Enter your PIN</div>
      <div class="pin-explain">Scoring as <b>${escapeHtml(judgeObj.name)}</b>.</div>
      <input type="tel" inputmode="numeric" maxlength="4" id="pinCheckInput" placeholder="4-digit PIN" style="text-align:center; letter-spacing:0.4em; font-size:1.3rem;">
      <button class="btn btn-primary" id="pinCheckBtn">Unlock</button>
      <div id="pinCheckErr" class="err" style="display:none; margin-top:10px;">Wrong PIN. Ask the organizer to reset it if you forgot.</div>
    </div>`;
    return html;
  }

  const myCats = judgeCategories(ev, state.judge);
  if(myCats.length === 0){
    return html + '<div class="empty">You have not been assigned to any categories yet. Ask the organizer to assign you in Setup.</div>';
  }

  html += '<div class="card">';
  html += '<label>Category</label>';
  html += '<select id="categorySelect">';
  html += '<option value="">Select category&hellip;</option>';
  myCats.forEach(c=>{
    html += `<option value="${c.id}" ${state.categoryId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`;
  });
  html += '</select>';
  html += '</div>';

  if(!state.categoryId) return html + '<div class="empty">Choose a category to see your assigned contestants.</div>';

  const cat = myCats.find(c=>c.id===state.categoryId);
  if(!cat) return html + '<div class="empty">Choose a category to see your assigned contestants.</div>';

  const myContestants = sortContestants(cat, cat.contestants.filter(ct => ct.assignedJudges.includes(state.judge)));
  if(myContestants.length===0) return html + '<div class="empty">No contestants assigned to you in this category yet.</div>';

  if(state.contestantId){
    const contestant = myContestants.find(c=>c.id===state.contestantId);
    if(contestant) return html + renderScoringCard(ev, cat, contestant);
  }

  html += '<div class="section-title">Your Contestants</div><div class="contestant-list">';
  myContestants.forEach(ct=>{
    const key = scoreKey(ev.id, cat.id, ct.id, state.judge);
    const done = !!state.scores[key];
    html += `<div class="contestant-item" data-contestant="${ct.id}">
      <div class="info"><b>${escapeHtml(contestantTitle(cat,ct))}</b><span>${escapeHtml(contestantSubtitle(cat,ct))}</span></div>
      <span class="badge ${done?'done':'pending'}">${done?'Scored':'Pending'}</span>
    </div>`;
  });
  html += '</div>';
  html += `<button class="btn btn-outline-light btn-small" id="printMyScoresBtn" style="width:100%; margin-top:12px;">Print my scores</button>`;
  return html;
}

export function renderScoringCard(ev, cat, contestant){
  const key = scoreKey(ev.id, cat.id, contestant.id, state.judge);
  const existing = state.scores[key];
  if(!state.draft[key]){
    state.draft[key] = existing ? {...existing} : {};
    cat.criteria.forEach(c=>{ if(state.draft[key][c.key] === undefined) state.draft[key][c.key] = 0; });
  }
  const draft = state.draft[key];
  const maxTotal = catMaxTotal(cat);
  const total = cat.criteria.reduce((s,c)=>s+(draft[c.key]||0),0);

  let html = `<button class="btn btn-outline btn-small" id="backToList" style="margin-bottom:12px;">&larr; Back to contestants</button>`;
  html += `<div class="card ticket">`;
  html += `<div class="event-name" style="color:var(--ink-soft); margin-bottom:4px;">${escapeHtml(ev.name)} &middot; ${escapeHtml(cat.name)}</div>`;
  html += `<div style="margin-bottom:10px;">
      <b style="font-size:1.15rem;">${escapeHtml(contestantTitle(cat,contestant))}</b><br>
      <span style="color:var(--ink-soft); font-size:0.85rem;">${escapeHtml(contestantSubtitle(cat,contestant))}</span>
    </div>`;

  cat.criteria.forEach(c=>{
    const val = draft[c.key] || 0;
    html += `<div class="criterion">
      <div class="top"><span class="name">${escapeHtml(c.label||'(unnamed criterion)')}</span></div>
      <div class="score-input-row">
        <input type="number" inputmode="numeric" min="0" max="${c.max}" value="${val}" data-crit="${c.key}" class="score-input">
        <span class="score-max">out of ${c.max}</span>
      </div>
    </div>`;
  });

  html += `<div class="total-strip"><span>Total</span><span class="num"><span id="liveTotal">${total}</span> <span style="font-size:1rem;">/ ${maxTotal}</span></span></div>`;
  html += `<button class="btn btn-primary" id="submitScore">${existing?'Update score':'Submit score'}</button>`;
  html += `</div>`;
  return html;
}

export function attachJudgeHandlers(){
  const evSel = document.getElementById('eventSelect');
  if(evSel) evSel.onchange = (e)=>{ state.eventId = e.target.value; state.judge=null; state.judgeUnlocked=false; state.categoryId=null; state.contestantId=null; render(); };

  const jSel = document.getElementById('judgeSelect');
  if(jSel) jSel.onchange = (e)=>{ state.judge = e.target.value || null; state.judgeUnlocked=false; state.categoryId=null; state.contestantId=null; render(); };

  const pinSetBtn = document.getElementById('pinSetBtn');
  if(pinSetBtn) pinSetBtn.onclick = async ()=>{
    const val = document.getElementById('pinSetInput').value.trim();
    const errEl = document.getElementById('pinSetErr');
    if(!/^\d{4}$/.test(val)){ errEl.style.display='block'; return; }
    const ev = currentEvent();
    const judgeObj = currentJudgeObj(ev);
    judgeObj.pin = val;
    await saveConfig();
    state.judgeUnlocked = true;
    render();
  };

  const pinCheckBtn = document.getElementById('pinCheckBtn');
  if(pinCheckBtn) pinCheckBtn.onclick = ()=>{
    const val = document.getElementById('pinCheckInput').value.trim();
    const ev = currentEvent();
    const judgeObj = currentJudgeObj(ev);
    const errEl = document.getElementById('pinCheckErr');
    if(val === judgeObj.pin){ state.judgeUnlocked = true; render(); }
    else { errEl.style.display='block'; }
  };

  const catSel = document.getElementById('categorySelect');
  if(catSel) catSel.onchange = (e)=>{ state.categoryId = e.target.value || null; state.contestantId=null; render(); };

  document.querySelectorAll('.contestant-item').forEach(el=>{
    el.onclick = ()=>{ state.contestantId = el.getAttribute('data-contestant'); render(); };
  });

  const back = document.getElementById('backToList');
  if(back) back.onclick = ()=>{ state.contestantId=null; render(); };

  const printMyScoresBtn = document.getElementById('printMyScoresBtn');
  if(printMyScoresBtn) printMyScoresBtn.onclick = ()=>{
    const ev = currentEvent();
    const cat = ev.categories.find(c=>c.id===state.categoryId);
    if(!cat) return;
    printMyScores(ev, cat, state.judge);
  };

  document.querySelectorAll('input.score-input[data-crit]').forEach(el=>{
    const updateLiveTotal = (cat, key)=>{
      const total = cat.criteria.reduce((s,c)=>s+(state.draft[key][c.key]||0),0);
      const totalEl = document.getElementById('liveTotal');
      if(totalEl) totalEl.textContent = total;
    };
    el.oninput = (e)=>{
      const ev = currentEvent();
      const cat = ev.categories.find(c=>c.id===state.categoryId);
      const contestant = cat.contestants.find(c=>c.id===state.contestantId);
      const critKey = e.target.getAttribute('data-crit');
      let v = parseInt(e.target.value,10);
      if(isNaN(v)) v = 0;
      const key = scoreKey(ev.id, cat.id, contestant.id, state.judge);
      state.draft[key][critKey] = v;
      updateLiveTotal(cat, key);
    };
    el.onblur = (e)=>{
      const ev = currentEvent();
      const cat = ev.categories.find(c=>c.id===state.categoryId);
      const contestant = cat.contestants.find(c=>c.id===state.contestantId);
      const critKey = e.target.getAttribute('data-crit');
      const crit = cat.criteria.find(c=>c.key===critKey);
      let v = parseInt(e.target.value,10);
      if(isNaN(v) || v<0) v = 0;
      if(crit && v>crit.max) v = crit.max;
      e.target.value = v;
      const key = scoreKey(ev.id, cat.id, contestant.id, state.judge);
      state.draft[key][critKey] = v;
      updateLiveTotal(cat, key);
    };
  });

  const submitBtn = document.getElementById('submitScore');
  if(submitBtn) submitBtn.onclick = async ()=>{
    const ev = currentEvent();
    const cat = ev.categories.find(c=>c.id===state.categoryId);
    const contestant = cat.contestants.find(c=>c.id===state.contestantId);
    const key = scoreKey(ev.id, cat.id, contestant.id, state.judge);
    const entry = {...state.draft[key], judge: state.judge, event: ev.id, category: cat.id, contestant: contestant.id, submittedAt: Date.now()};
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving\u2026';
    const ok = await saveScoreEntry(key, entry);
    if(ok){
      showToast('Score saved for ' + contestantTitle(cat, contestant));
      state.contestantId = null;
      render();
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit score';
    }
  };
}
