import { state } from '../state.js';
import { catMaxTotal, contestantSubtitle, contestantTitle, escapeHtml, scoreKey, sortContestants } from '../utils.js';

export function renderJudgeDetail(ev){
  if(ev.categories.length===0) return '<div class="empty">No categories yet for this event. Add one in Setup.</div>';

  let html = '<div class="card"><label>Category</label><select id="detailCategorySelect">';
  ev.categories.forEach(c=>{
    html += `<option value="${c.id}" ${state.categoryId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`;
  });
  html += '</select></div>';

  const catId = state.categoryId || ev.categories[0].id;
  const cat = ev.categories.find(c=>c.id===catId);
  if(!cat) return html;

  if(cat.contestants.length===0) return html + '<div class="empty">No entries in this category yet.</div>';

  sortContestants(cat, cat.contestants).forEach(ct=>{
    html += `<div class="card"><b>${escapeHtml(contestantTitle(cat,ct))}</b>`;
    if(contestantSubtitle(cat,ct)) html += `<div style="color:var(--ink-soft); font-size:0.82rem; margin-bottom:10px;">${escapeHtml(contestantSubtitle(cat,ct))}</div>`;
    if(ct.assignedJudges.length===0){
      html += `<div class="small-note" style="margin-top:8px;">No judges assigned.</div>`;
    } else {
      ct.assignedJudges.forEach(judgeName=>{
        const key = scoreKey(ev.id, cat.id, ct.id, judgeName);
        const s = state.scores[key];
        const editing = state.orgEditKey === key;
        html += `<div style="border-top:1px solid var(--line); padding-top:10px; margin-top:10px;">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">`;
        html += `<div style="font-weight:700; font-size:0.85rem;">${escapeHtml(judgeName)}</div>`;
        if(!editing){
          html += `<button class="btn btn-outline btn-small" data-edit-score="${escapeHtml(key)}" style="padding:2px 10px; font-size:0.72rem;">${s?'Edit':'Enter score'}</button>`;
        }
        html += `</div>`;
        if(editing){
          if(!state.orgEditDraft[key]){
            state.orgEditDraft[key] = {};
            if(s && s.totalOnly){
              state.orgEditDraft[key].total = cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0);
            } else {
              cat.criteria.forEach(c=>{ state.orgEditDraft[key][c.key] = s ? (s[c.key]||0) : 0; });
            }
          }
          const draft = state.orgEditDraft[key];
          if(s && s.totalOnly){
            html += `<div style="display:flex; align-items:center; gap:8px; margin:6px 0;">`;
            html += `<label style="font-size:0.82rem;">Total</label>`;
            html += `<input type="number" min="0" max="${catMaxTotal(cat)}" value="${draft.total}" data-org-edit-total="${escapeHtml(key)}" style="width:80px;">`;
            html += `<span style="font-size:0.78rem; color:var(--ink-soft);">/ ${catMaxTotal(cat)}</span>`;
            html += `</div>`;
          } else {
            cat.criteria.forEach(c=>{
              html += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; padding:2px 0;">`;
              html += `<span>${escapeHtml(c.label||'(unnamed)')}</span>`;
              html += `<input type="number" min="0" max="${c.max}" value="${draft[c.key]||0}" data-org-edit-key="${escapeHtml(key)}" data-org-edit-crit="${c.key}" style="width:64px;">`;
              html += `</div>`;
            });
            const editTotal = cat.criteria.reduce((sum,c)=>sum+(draft[c.key]||0),0);
            html += `<div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700; margin-top:4px; padding-top:4px; border-top:1px solid var(--line);"><span>Total</span><span data-org-total-for="${escapeHtml(key)}">${editTotal} / ${catMaxTotal(cat)}</span></div>`;
          }
          html += `<div style="display:flex; gap:8px; margin-top:8px;">`;
          html += `<button class="btn btn-primary btn-small" data-save-score-edit="${escapeHtml(key)}">Save</button>`;
          html += `<button class="btn btn-outline btn-small" data-cancel-score-edit="${escapeHtml(key)}">Cancel</button>`;
          html += `</div>`;
        } else if(!s){
          html += `<div style="color:var(--ink-soft); font-size:0.82rem;">Not yet scored</div>`;
        } else if(s.totalOnly){
          const total = cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0);
          html += `<div style="font-size:0.9rem;">Total: <b>${total}</b> <span style="color:var(--ink-soft); font-size:0.78rem;">(breakdown not recorded for this entry)</span></div>`;
        } else {
          cat.criteria.forEach(c=>{
            html += `<div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:2px 0;"><span>${escapeHtml(c.label||'(unnamed)')}</span><span>${s[c.key]||0} / ${c.max}</span></div>`;
          });
          const total = cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0);
          html += `<div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700; margin-top:4px; padding-top:4px; border-top:1px solid var(--line);"><span>Total</span><span>${total} / ${catMaxTotal(cat)}</span></div>`;
        }
        html += `</div>`;
      });
    }
    html += `</div>`;
  });

  return html;
}
