import { state } from './state.js';
import { showToast } from './ui.js';
import { catMaxTotal, contestantSubtitle, contestantTitle, escapeHtml, formatEventDateRange, rankContestants, scoreKey, setLastPrintedAt } from './utils.js';

// Shared black-and-white chrome for all three printouts -- blank scoring
// sheets, a judge's own scoring record, and the sign-off sheet. Pure
// black-on-white, no color, no grey fills (see CONTEXT.md's print section).
function buildPrintHeader(ev, docTitle){
  const dateRange = formatEventDateRange(ev.eventDateStart, ev.eventDateEnd);
  return `
    <div class="print-header-row">
      <div class="print-header-wordmark">Judge D Show</div>
      <div class="print-doctype">${escapeHtml(docTitle)}</div>
    </div>
    <div class="print-meta-row">
      <div class="print-meta-field"><span class="print-meta-label">Event</span><span class="print-meta-value">${escapeHtml(ev.name)}</span></div>
      <div class="print-meta-field"><span class="print-meta-label">Date</span><span class="print-meta-value">${dateRange ? escapeHtml(dateRange) : '&nbsp;'}</span></div>
      <div class="print-meta-field"><span class="print-meta-label">Venue</span><span class="print-meta-value">${ev.venue ? escapeHtml(ev.venue) : '&nbsp;'}</span></div>
    </div>`;
}

function buildPrintSubrow(catName, judgeName){
  const parts = [`<span class="print-meta-field"><span class="print-meta-label">Category</span><span class="print-meta-value">${escapeHtml(catName)}</span></span>`];
  if(judgeName) parts.push(`<span class="print-meta-field"><span class="print-meta-label">Judge</span><span class="print-meta-value">${escapeHtml(judgeName)}</span></span>`);
  return `<div class="print-meta-row print-meta-subrow">${parts.join('')}</div>`;
}

function buildPrintFooter(){
  return `<div class="print-footer">
      <span class="print-footer-copyright">&copy; 2026 Immortelle Advisory Group</span>
      <span class="print-footer-wordmark">Judge D Show</span>
    </div>`;
}

// Score numbers only load correctly once the webfonts are actually ready --
// otherwise Fraunces 900 italic can still be swapping in mid-print.
async function printWhenFontsReady(){
  if(document.fonts && document.fonts.ready) await document.fonts.ready;
  window.print();
}

export function buildBlankSheetPageHtml(ev, cat, judgeName){
  const contestants = cat.contestants.filter(ct=>ct.assignedJudges.includes(judgeName));
  if(contestants.length===0) return '';
  let html = `<div class="print-page">`;
  html += buildPrintHeader(ev, 'Blank Scoring Sheet');
  html += buildPrintSubrow(cat.name, judgeName);
  contestants.forEach(ct=>{
    html += `<div style="margin-bottom:18px; border:1px solid #000; padding:10px;">`;
    html += `<div style="font-weight:700; margin-bottom:6px;">${escapeHtml(contestantTitle(cat,ct))}</div>`;
    const sub = contestantSubtitle(cat,ct);
    if(sub) html += `<div style="font-size:0.85rem; margin-bottom:8px;">${escapeHtml(sub)}</div>`;
    cat.criteria.forEach(c=>{
      html += `<div class="print-criteria-row"><span>${escapeHtml(c.label||'(unnamed)')} (max ${c.max})</span><span class="print-blank-line"></span></div>`;
    });
    html += `<div class="print-criteria-row" style="font-weight:700;"><span>Total (max ${catMaxTotal(cat)})</span><span class="print-blank-line"></span></div>`;
    html += `</div>`;
  });
  html += buildPrintFooter();
  html += `</div>`;
  return html;
}

export async function printBlankSheets(ev){
  let pages = '';
  ev.judges.forEach(j=>{
    ev.categories.forEach(cat=>{
      pages += buildBlankSheetPageHtml(ev, cat, j.name);
    });
  });
  if(!pages){ showToast('No judges assigned to any contestants yet', true); return; }
  document.getElementById('printArea').innerHTML = pages;
  await printWhenFontsReady();
}

export function buildJudgeScoresPageHtml(ev, cat, judgeName){
  const contestants = cat.contestants.filter(ct=>ct.assignedJudges.includes(judgeName));
  let html = `<div class="print-page">`;
  html += buildPrintHeader(ev, 'Judge Scoring Record');
  html += buildPrintSubrow(cat.name, judgeName);
  contestants.forEach(ct=>{
    const key = scoreKey(ev.id, cat.id, ct.id, judgeName);
    const s = state.scores[key];
    html += `<div style="margin-bottom:18px; border:1px solid #000; padding:10px;">`;
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
  html += buildPrintFooter();
  html += `</div>`;
  return html;
}

export async function printMyScores(ev, cat, judgeName){
  document.getElementById('printArea').innerHTML = buildJudgeScoresPageHtml(ev, cat, judgeName);
  await printWhenFontsReady();
}

export function buildSignoffPageHtml(ev, cat){
  // Only judges actually assigned to this category's entries get a
  // signature line -- matches Live Tally's table columns (catJudges there),
  // not every judge on the whole event.
  const catJudges = ev.judges.filter(j => cat.contestants.some(ct => ct.assignedJudges.includes(j.name)));
  const rows = rankContestants(ev, cat, cat.contestants, catJudges);

  let html = `<div class="print-page">`;
  html += buildPrintHeader(ev, 'Official Sign-off Sheet');
  html += buildPrintSubrow(cat.name);
  html += `<table class="print-table"><thead><tr><th>Place</th><th>Entry</th>`;
  catJudges.forEach(j=>{ html += `<th class="print-num">${escapeHtml(j.name)}</th>`; });
  html += `<th class="print-num">Total</th></tr></thead><tbody>`;
  rows.forEach((r,i)=>{
    const place = r.total!==null ? (i+1) : '—';
    const sub = contestantSubtitle(cat,r.contestant);
    html += `<tr><td>${place}</td><td>${escapeHtml(contestantTitle(cat,r.contestant))}${sub?' — '+escapeHtml(sub):''}</td>`;
    r.perJudge.forEach(p=>{
      if(p.status==='na') html += `<td class="print-num">·</td>`;
      else if(p.status==='pending') html += `<td class="print-num">—</td>`;
      else html += `<td class="print-num">${p.value}</td>`;
    });
    html += `<td class="print-num"><b>${r.total===null?'—':r.total}</b></td></tr>`;
  });
  html += `</tbody></table>`;

  html += `<div class="print-signatures">`;
  html += `<div class="print-sig-grid">`;
  catJudges.forEach(j=>{
    html += `<div class="sig-line"><div class="sig-blank"></div><span>${escapeHtml(j.name)} — Signature</span></div>`;
  });
  html += `</div>`;
  html += `<div class="print-cert-block">`;
  html += `<div class="print-cert-sentence">I certify the scores recorded above are accurate and final as tallied by Judge D Show.</div>`;
  html += `<div class="print-cert-row">`;
  html += `<div class="sig-line"><div class="sig-blank"></div><span>Head Judge Signature</span></div>`;
  html += `<div class="sig-line print-cert-date"><div class="sig-blank"></div><span>Date</span></div>`;
  html += `</div></div>`;
  html += `</div>`;
  html += buildPrintFooter();
  html += `</div>`;
  return html;
}

export async function printSignoffSheet(ev, cat){
  document.getElementById('printArea').innerHTML = buildSignoffPageHtml(ev, cat);
  await printWhenFontsReady();
  setLastPrintedAt(ev.id, cat.id);
}

export async function printAllSignoffSheets(ev){
  if(ev.categories.length===0){ showToast('No categories to print', true); return; }
  document.getElementById('printArea').innerHTML = ev.categories.map(c=>buildSignoffPageHtml(ev,c)).join('');
  await printWhenFontsReady();
  ev.categories.forEach(c=>setLastPrintedAt(ev.id, c.id));
}
