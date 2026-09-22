import { state } from './state.js';
import { showToast } from './ui.js';
import { catMaxTotal, contestantSubtitle, contestantTitle, escapeHtml, scoreKey, setLastPrintedAt } from './utils.js';

export function buildBlankSheetPageHtml(ev, cat, judgeName){
  const contestants = cat.contestants.filter(ct=>ct.assignedJudges.includes(judgeName));
  if(contestants.length===0) return '';
  let html = `<div class="print-page">`;
  html += `<div class="print-header"><h1>${escapeHtml(ev.name)}</h1><h2>Blank Scoring Sheet</h2><h3>${escapeHtml(cat.name)}</h3></div>`;
  html += `<div class="print-meta">Judge: <b>${escapeHtml(judgeName)}</b> &nbsp;&nbsp; Date: <span class="print-blank-line" style="width:120px;"></span></div>`;
  contestants.forEach(ct=>{
    html += `<div style="margin-bottom:18px; border:1px solid #333; padding:10px;">`;
    html += `<div style="font-weight:700; margin-bottom:6px;">${escapeHtml(contestantTitle(cat,ct))}</div>`;
    const sub = contestantSubtitle(cat,ct);
    if(sub) html += `<div style="font-size:0.85rem; margin-bottom:8px;">${escapeHtml(sub)}</div>`;
    cat.criteria.forEach(c=>{
      html += `<div class="print-criteria-row"><span>${escapeHtml(c.label||'(unnamed)')} (max ${c.max})</span><span class="print-blank-line"></span></div>`;
    });
    html += `<div class="print-criteria-row" style="font-weight:700;"><span>Total (max ${catMaxTotal(cat)})</span><span class="print-blank-line"></span></div>`;
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

export function printBlankSheets(ev){
  let pages = '';
  ev.judges.forEach(j=>{
    ev.categories.forEach(cat=>{
      pages += buildBlankSheetPageHtml(ev, cat, j.name);
    });
  });
  if(!pages){ showToast('No judges assigned to any contestants yet', true); return; }
  document.getElementById('printArea').innerHTML = pages;
  window.print();
}

export function buildJudgeScoresPageHtml(ev, cat, judgeName){
  const contestants = cat.contestants.filter(ct=>ct.assignedJudges.includes(judgeName));
  let html = `<div class="print-page">`;
  html += `<div class="print-header"><h1>${escapeHtml(ev.name)}</h1><h2>Judge Scoring Record</h2><h3>${escapeHtml(cat.name)}</h3></div>`;
  html += `<div class="print-meta">Judge: <b>${escapeHtml(judgeName)}</b> &nbsp;&nbsp; Printed: ${new Date().toLocaleString()}</div>`;
  contestants.forEach(ct=>{
    const key = scoreKey(ev.id, cat.id, ct.id, judgeName);
    const s = state.scores[key];
    html += `<div style="margin-bottom:18px; border:1px solid #333; padding:10px;">`;
    html += `<div style="font-weight:700; margin-bottom:6px;">${escapeHtml(contestantTitle(cat,ct))}</div>`;
    const sub = contestantSubtitle(cat,ct);
    if(sub) html += `<div style="font-size:0.85rem; margin-bottom:8px;">${escapeHtml(sub)}</div>`;
    if(!s){
      html += `<div style="font-size:0.85rem;">Not yet scored</div>`;
    } else if(s.totalOnly){
      const total = cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0);
      html += `<div class="print-criteria-row" style="font-weight:700;"><span>Total</span><span>${total} / ${catMaxTotal(cat)}</span></div>`;
    } else {
      cat.criteria.forEach(c=>{
        html += `<div class="print-criteria-row"><span>${escapeHtml(c.label||'(unnamed)')}</span><span>${s[c.key]||0} / ${c.max}</span></div>`;
      });
      const total = cat.criteria.reduce((sum,c)=>sum+(s[c.key]||0),0);
      html += `<div class="print-criteria-row" style="font-weight:700;"><span>Total</span><span>${total} / ${catMaxTotal(cat)}</span></div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

export function printMyScores(ev, cat, judgeName){
  document.getElementById('printArea').innerHTML = buildJudgeScoresPageHtml(ev, cat, judgeName);
  window.print();
}

export function buildSignoffPageHtml(ev, cat){
  const rows = cat.contestants.map(ct=>{
    const perJudge = ev.judges.map(j=>{
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

  let html = `<div class="print-page">`;
  html += `<div class="print-header"><h1>${escapeHtml(ev.name)}</h1><h2>Final Tally Sheet</h2><h3>${escapeHtml(cat.name)}</h3></div>`;
  html += `<table class="print-table"><thead><tr><th>Place</th><th>Entry</th>`;
  ev.judges.forEach(j=>{ html += `<th>${escapeHtml(j.name)}</th>`; });
  html += `<th>Total</th></tr></thead><tbody>`;
  rows.forEach((r,i)=>{
    const place = r.total!==null ? (i+1) : '\u2014';
    const sub = contestantSubtitle(cat,r.contestant);
    html += `<tr><td>${place}</td><td>${escapeHtml(contestantTitle(cat,r.contestant))}${sub?' \u2014 '+escapeHtml(sub):''}</td>`;
    r.perJudge.forEach(p=>{
      if(p.status==='na') html += `<td>\u00b7</td>`;
      else if(p.status==='pending') html += `<td>\u2014</td>`;
      else html += `<td>${p.value}</td>`;
    });
    html += `<td><b>${r.total===null?'\u2014':r.total}</b></td></tr>`;
  });
  html += `</tbody></table>`;
  html += `<div class="print-signatures">`;
  ev.judges.forEach(j=>{
    html += `<div class="sig-line"><span>${escapeHtml(j.name)} \u2014 Signature</span><div class="sig-blank"></div></div>`;
  });
  html += `<div class="sig-line"><span>Judges Coordinator \u2014 Signature</span><div class="sig-blank"></div></div>`;
  html += `</div></div>`;
  return html;
}

export function printSignoffSheet(ev, cat){
  document.getElementById('printArea').innerHTML = buildSignoffPageHtml(ev, cat);
  window.print();
  setLastPrintedAt(ev.id, cat.id);
}

export function printAllSignoffSheets(ev){
  if(ev.categories.length===0){ showToast('No categories to print', true); return; }
  document.getElementById('printArea').innerHTML = ev.categories.map(c=>buildSignoffPageHtml(ev,c)).join('');
  window.print();
  ev.categories.forEach(c=>setLastPrintedAt(ev.id, c.id));
}
