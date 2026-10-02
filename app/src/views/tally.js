import { state } from '../state.js';
import { contestantSubtitle, contestantTitle, escapeHtml, getLastPrintedAt, getTallyView, rankContestants, shortJudgeLabel } from '../utils.js';

// Last total rendered per event/category/contestant. When a render shows a
// different total than the previous one (a judge just submitted or was
// corrected), that total gets a one-shot .score-flash so organizers can see
// which line moved. First sight of a total never flashes, so page load,
// category switches and table/cards toggles stay quiet.
const lastTotals = new Map();
function totalChanged(scope, contestantId, total){
  const key = scope + '|' + contestantId;
  const had = lastTotals.has(key);
  const prev = lastTotals.get(key);
  lastTotals.set(key, total);
  return had && prev !== total;
}

export function renderTally(ev){
  if(ev.categories.length===0) return '<div class="empty">No categories yet for this event. Add one below.</div>';

  let html = '<div class="card"><label>Category</label><select id="tallyCategorySelect">';
  ev.categories.forEach(c=>{
    html += `<option value="${c.id}" ${state.categoryId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`;
  });
  html += '</select></div>';

  const catId = state.categoryId || ev.categories[0].id;
  const cat = ev.categories.find(c=>c.id===catId);
  if(!cat) return html;

  const stages = cat.stages || [];
  if(stages.length){
    if(state.tallyStageFilter && !stages.includes(state.tallyStageFilter)) state.tallyStageFilter = '';
    html += `<div class="card"><label>Stage</label><select id="tallyStageSelect">
        <option value="">All stages</option>
        ${stages.map(s=>`<option value="${escapeHtml(s)}" ${state.tallyStageFilter===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
      </select></div>`;
  }

  const lastPrinted = getLastPrintedAt(ev.id, catId);
  const lastOrgEdit = (state.organizerEditSummary[ev.id] || {})[catId];
  const editedSincePrint = !!(lastPrinted && lastOrgEdit && new Date(lastOrgEdit).getTime() > lastPrinted);

  html += `<div class="row" style="margin-bottom:12px; align-items:center; flex-wrap:wrap; gap:8px;">
      <button class="btn btn-outline-light btn-small" id="printSignoffBtn">Print for signatures</button>
      <button class="btn btn-outline-light btn-small" id="printAllSignoffBtn">Print all categories</button>
      <button class="btn btn-outline-light btn-small" data-view-history="${escapeHtml(catId)}">View edit history</button>
      ${editedSincePrint ? '<span style="color:var(--pending); font-weight:700; font-size:0.82rem;">&#9888; Edited by organizer since sign-off was last printed</span>' : ''}
    </div>`;

  if(state.historyPanelCategoryId === catId){
    html += renderHistoryPanel(ev.id, cat);
  }

  const visibleContestants = (stages.length && state.tallyStageFilter)
    ? cat.contestants.filter(ct=>ct.stage===state.tallyStageFilter)
    : cat.contestants;

  const catJudges = ev.judges.filter(j => visibleContestants.some(ct => ct.assignedJudges.includes(j.name)));
  const rows = rankContestants(ev, cat, visibleContestants, catJudges);

  html += `<div class="status-line">${catJudges.length} of ${ev.judges.length} judge${ev.judges.length!==1?'s':''} assigned to this category &middot; columns marked &middot; mean not assigned to that contestant</div>`;

  const view = getTallyView();
  html += `<div class="tally-view-toggle">
      <button data-tally-view="table" class="${view==='table'?'active':''}">Table</button>
      <button data-tally-view="cards" class="${view==='cards'?'active':''}">Cards</button>
    </div>`;

  const scope = ev.id + '|' + cat.id;
  html += view === 'cards' ? renderTallyCards(cat, rows, scope) : renderTallyTable(cat, catJudges, rows, scope);
  return html;
}

function renderTallyTable(cat, catJudges, rows, scope){
  let html = '<div class="card"><table><thead><tr><th style="width:26px;">Pos.</th><th>Entry</th>';
  catJudges.forEach(j=>{ html += `<th style="width:32px;">${escapeHtml(shortJudgeLabel(j.name))}</th>`; });
  html += '<th style="width:42px;">Total</th></tr></thead><tbody>';
  rows.forEach((r,i)=>{
    const place = r.total!==null ? (i+1) : '&mdash;';
    html += `<tr class="${i===0 && r.total!==null?'rank1':''}">
      <td class="num">${place}</td>
      <td class="entry-cell"><b>${escapeHtml(contestantTitle(cat,r.contestant))}</b><br><span style="color:var(--ink-soft);">${escapeHtml(contestantSubtitle(cat,r.contestant))}</span></td>`;
    r.perJudge.forEach(p=>{
      if(p.status==='na') html += `<td class="num muted">&middot;</td>`;
      else if(p.status==='pending') html += `<td class="num">&mdash;</td>`;
      else html += `<td class="num">${p.value}</td>`;
    });
    const flash = totalChanged(scope, r.contestant.id, r.total) ? ' score-flash' : '';
    html += `<td class="num"><span class="score-num${flash}">${r.total===null?'&mdash;':r.total}</span></td></tr>`;
  });
  html += '</tbody></table></div>';
  return html;
}

function renderTallyCards(cat, rows, scope){
  let html = '<div class="tally-card-grid">';
  rows.forEach((r,i)=>{
    const place = r.total!==null ? (i+1) : '—';
    const submittedCount = r.perJudge.filter(p=>p.status==='scored').length;
    const totalAssigned = r.perJudge.filter(p=>p.status!=='na').length;
    const isRank1 = i===0 && r.total!==null;
    const flash = totalChanged(scope, r.contestant.id, r.total) ? ' score-flash' : '';
    html += `<div class="tally-card${isRank1?' rank1':''}">
        <div class="tally-card-top">
          <span class="tally-card-place-name">${place}. ${escapeHtml(contestantTitle(cat,r.contestant))}</span>
        </div>
        <div class="tally-card-subtitle">${escapeHtml(contestantSubtitle(cat,r.contestant))}</div>
        <div class="tally-card-total"><span class="score-num${flash}">${r.total===null?'—':r.total}</span></div>
        <div class="tally-card-status">${submittedCount} of ${totalAssigned} judge${totalAssigned!==1?'s':''} submitted</div>
      </div>`;
  });
  html += '</div>';
  return html;
}

function renderHistoryPanel(eventId, cat){
  const cacheKey = eventId + '|' + cat.id;
  const rows = state.scoreHistoryCache[cacheKey];
  let html = '<div class="card">';
  html += '<div style="font-weight:700; margin-bottom:8px;">Edit history — ' + escapeHtml(cat.name) + '</div>';
  if(!rows){
    html += '<div class="small-note">Loading…</div>';
  } else if(rows.length === 0){
    html += '<div class="small-note">No changes logged for this category yet.</div>';
  } else {
    html += '<table><thead><tr><th>When</th><th>Entry</th><th>Judge</th><th>By</th><th>Total</th></tr></thead><tbody>';
    rows.forEach(r=>{
      const ct = cat.contestants.find(c=>c.id===r.contestant_id);
      const entryLabel = ct ? contestantTitle(cat, ct) : '(removed entry)';
      const total = cat.criteria.reduce((sum,c)=>sum+((r.values||{})[c.key]||0),0);
      const by = r.changed_by === 'organizer' ? 'Organizer correction' : 'Judge submission';
      html += `<tr><td>${new Date(r.changed_at).toLocaleString()}</td><td>${escapeHtml(entryLabel)}</td><td>${escapeHtml(shortJudgeLabel(r.judge_slot))}</td><td>${by}</td><td class="num">${total}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}
