import { state } from '../state.js';
import { contestantSubtitle, contestantTitle, escapeHtml, scoreKey, shortJudgeLabel } from '../utils.js';

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

  html += `<div class="row" style="margin-bottom:12px;">
      <button class="btn btn-outline-light btn-small" id="printSignoffBtn">Print for signatures</button>
      <button class="btn btn-outline-light btn-small" id="printAllSignoffBtn">Print all categories</button>
    </div>`;

  const catJudges = ev.judges.filter(j => cat.contestants.some(ct => ct.assignedJudges.includes(j.name)));

  const rows = cat.contestants.map(ct=>{
    const perJudge = catJudges.map(j=>{
      if(!ct.assignedJudges.includes(j.name)) return {status:'na'};
      const key = scoreKey(ev.id, cat.id, ct.id, j.name);
      const s = state.scores[key];
      if(!s) return {status:'pending'};
      return {status:'scored', value: cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0)};
    });
    const submitted = perJudge.filter(p=>p.status==='scored').map(p=>p.value);
    const total = submitted.length ? submitted.reduce((a,b)=>a+b,0) : null;
    return { contestant: ct, perJudge, total };
  });

  rows.sort((a,b)=>{
    if(a.total===null && b.total===null) return 0;
    if(a.total===null) return 1;
    if(b.total===null) return -1;
    return b.total - a.total;
  });

  html += `<div class="status-line">${catJudges.length} of ${ev.judges.length} judge${ev.judges.length!==1?'s':''} assigned to this category &middot; columns marked &middot; mean not assigned to that contestant</div>`;

  html += '<div class="card"><table><thead><tr><th style="width:26px;">Pos.</th><th>Entry</th>';
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
    html += `<td class="num">${r.total===null?'&mdash;':r.total}</td></tr>`;
  });
  html += '</tbody></table></div>';
  return html;
}
