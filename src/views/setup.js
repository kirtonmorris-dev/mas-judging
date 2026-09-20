import { saveConfig } from '../api.js';
import { render } from '../main.js';
import { state } from '../state.js';
import { catMaxTotal, escapeAttr, escapeHtml, sortContestants, uid } from '../utils.js';

export function renderSetup(ev){
  let html = '';
  html += '<div class="card"><div class="section-title" style="color:var(--ink); margin:0 0 12px;">Judges — ' + escapeHtml(ev.name) + '</div><div class="chip-row">';
  ev.judges.forEach(j=>{
    const hasPin = j.pin !== null && j.pin !== undefined;
    html += `<span class="chip"><b>${escapeHtml(j.name)}</b> <span style="color:var(--ink-soft); font-weight:400;">(${escapeHtml(j.realName||j.name)})</span>
      <span class="pinflag ${hasPin?'set':'unset'}">${hasPin?'PIN set':'No PIN'}</span>
      ${hasPin?`<button class="reset" data-reset-pin="${escapeAttr(j.name)}">reset</button>`:''}
      <button data-remove-judge="${escapeAttr(j.name)}">&times;</button></span>`;
  });
  html += '</div><div class="row"><input type="text" id="setupNewJudge" placeholder="Add judge (real name, kept private)"><button class="btn btn-outline btn-small" id="setupAddJudge" style="flex:0 0 auto;">Add</button></div>'
    + '<div class="small-note" style="margin-top:8px; text-align:left;">Judges appear here by real name so you can keep track of who\'s who. Everywhere else in the app — Live Tally, Judge Detail, printed sheets, and the Judge tab — they only ever show as "Judge 1", "Judge 2", etc. Tell each judge their number privately so they can find their slot under the Judge tab.</div>'
    + '</div>';

  html += '<button class="btn btn-outline-light btn-small" id="printBlankSheetsBtn" style="width:100%; margin-bottom:16px;">Print blank scoring sheets (all judges)</button>';

  html += '<div class="section-title">Categories — ' + escapeHtml(ev.name) + '</div>';
  html += '<div class="card"><div class="row"><input type="text" id="setupNewCategory" placeholder="New category name"><button class="btn btn-outline btn-small" id="setupAddCategory" style="flex:0 0 auto;">Add</button></div></div>';

  html += `<div class="import-box">
      <label>Import contestants into a category</label>
      <select id="importTargetCategory">
        <option value="">Choose a category&hellip;</option>
        ${ev.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        <option value="__new__">+ Create new category&hellip;</option>
      </select>
      <input type="text" id="importNewCategoryName" placeholder="New category name" style="display:none;">
      <input type="file" accept=".xlsx,.xls,.csv" id="eventImportFile">
      <div class="small-note" style="margin-top:8px; text-align:left;">First row = headers. Columns matched by name: <b>Band</b>, <b>Masquerader</b>, <b>Portrayal</b> (any order, case-insensitive). For Group-type categories (bands, steelbands, DJ, etc.) Masquerader is ignored and Band is the identifying field. Any "Category" or "Judge Name" column in the file is ignored — every row goes into the category you chose above. Duplicate rows for the same contestant (e.g. one row per judge) are automatically collapsed. Adds to the list, doesn't replace it.</div>
      <div class="import-status" id="eventImportStatus"></div>
    </div>`;

  html += `<div class="import-box">
      <label>Import a full workbook (one category per sheet)</label>
      <input type="file" accept=".xlsx,.xls" id="workbookImportFile">
      <div id="workbookSheetWrap" style="display:none; margin-top:10px;">
        <label>Sheet to import</label>
        <select id="workbookSheetSelect"></select>
        <button class="btn btn-outline btn-small" id="workbookSheetGoBtn" style="width:100%; margin-top:8px;">Import this sheet as its own category</button>
      </div>
      <div class="small-note" style="margin-top:8px; text-align:left;">Upload a workbook with multiple tabs (like a full judging packet). Pick a tab and this creates (or reuses) a category named after that tab, automatically finds the header row even with title rows above it, detects Individual vs Group based on whether there's a Masquerader column, and pre-fills the judging criteria and points from the column headers (e.g. "Color &amp; Impact 30"). Repeat once per tab you want to bring in.</div>
      <div class="import-status" id="workbookImportStatus"></div>
    </div>`;

  html += `<div class="card"><label>Filter categories</label><input type="text" id="categoryFilterInput" placeholder="Type to filter by name..." value="${escapeAttr(state.categoryFilter||'')}"></div>`;

  html += `<div id="categoriesListContainer">${renderCategoryCards(ev)}</div>`;

  return html;
}

export function renderCategoryCards(ev){
  const filter = (state.categoryFilter||'').trim().toLowerCase();
  const cats = ev.categories.filter(cat => !filter || cat.name.toLowerCase().includes(filter));
  if(ev.categories.length===0) return '<div class="empty">No categories yet. Add one above.</div>';
  if(cats.length===0) return '<div class="empty">No categories match your filter.</div>';

  let html = '';
  cats.forEach(cat=>{
    const maxTotal = catMaxTotal(cat);
    const expanded = !!state.expandedCats[cat.id];
    html += `<div class="card">`;
    html += `<div data-cat-toggle="${cat.id}" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
        <div>
          <b>${escapeHtml(cat.name)}</b>
          <div style="font-size:0.75rem; color:var(--ink-soft); margin-top:2px;">${cat.entryType==='group'?'Group':'Individual'} &middot; ${cat.contestants.length} contestant${cat.contestants.length!==1?'s':''} &middot; ${maxTotal} pts</div>
        </div>
        <span style="font-size:1.1rem; color:var(--ink-soft);">${expanded?'&#9662;':'&#9656;'}</span>
      </div>`;

    if(expanded){
      html += `<div style="margin-top:14px;">`;
      html += `<div class="entry-type-row"><label>Entry type</label><div class="chip-row" style="margin-bottom:0;">
          <span class="chip etype ${cat.entryType==='individual'?'on':''}" data-etype="individual" data-cat="${cat.id}">Individual (Band + Masquerader + Portrayal)</span>
          <span class="chip etype ${cat.entryType==='group'?'on':''}" data-etype="group" data-cat="${cat.id}">Group (Band + Portrayal only)</span>
        </div></div>`;

      html += `<div class="crit-box">
        <label>Judging criteria</label>`;
      cat.criteria.forEach(c=>{
        html += `<div class="crit-row">
          <input type="text" value="${escapeAttr(c.label)}" placeholder="Criterion name" data-crit-field="label" data-cat="${cat.id}" data-crit="${c.key}">
          <input type="number" min="0" value="${c.max}" placeholder="Pts" data-crit-field="max" data-cat="${cat.id}" data-crit="${c.key}">
          <button class="btn-danger" data-crit-remove data-cat="${cat.id}" data-crit="${c.key}" style="padding:6px 10px;">&times;</button>
        </div>`;
      });
      html += `<button class="btn btn-outline btn-small" data-crit-add="${cat.id}">+ Add criterion</button>
        <div class="crit-total">Total: ${maxTotal} pts</div>
      </div>`;

      sortContestants(cat, cat.contestants).forEach(ct=>{
        html += `<div class="contestant-row">
          <div class="row"><div><label>Band</label><input type="text" value="${escapeAttr(ct.band)}" data-field="band" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;
        if(cat.entryType === 'individual'){
          html += `<div class="row"><div><label>Masquerader</label><input type="text" value="${escapeAttr(ct.masquerader)}" data-field="masquerader" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;
        }
        html += `<div class="row"><div><label>${cat.entryType==='group'?'Portrayal / Presentation Title':'Portrayal'}</label><input type="text" value="${escapeAttr(ct.portrayal)}" data-field="portrayal" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>
          <div class="assign-label">Assigned judges</div>
          <div class="chip-row" style="margin-bottom:8px;">`;
        if(ev.judges.length===0){
          html += `<span style="font-size:0.8rem; color:var(--ink-soft);">Add judges above first.</span>`;
        }
        ev.judges.forEach(j=>{
          const on = ct.assignedJudges.includes(j.name);
          html += `<span class="chip assign ${on?'on':'off'}" data-assign-toggle data-cat="${cat.id}" data-contestant="${ct.id}" data-judge="${escapeAttr(j.name)}">${escapeHtml(j.name)}</span>`;
        });
        html += `</div>
          <button class="btn-danger" data-remove-contestant="${ct.id}" data-cat2="${cat.id}">Remove contestant</button>
        </div>`;
      });
      html += `<button class="btn btn-outline btn-small" data-add-contestant="${cat.id}">+ Add contestant</button>`;
      html += `<div class="danger-zone">
          <div class="danger-zone-label">Danger zone</div>
          <button class="btn-danger-quiet" data-remove-cat="${cat.id}">Remove category</button>
        </div>`;
      html += `</div>`;
    }

    html += `</div>`;
  });

  return html;
}

export function attachCategoryCardHandlers(ev){
  document.querySelectorAll('[data-cat-toggle]').forEach(el=>{
    el.onclick = ()=>{
      const catId = el.getAttribute('data-cat-toggle');
      state.expandedCats[catId] = !state.expandedCats[catId];
      const container = document.getElementById('categoriesListContainer');
      if(container){
        container.innerHTML = renderCategoryCards(ev);
        attachCategoryCardHandlers(ev);
      } else {
        render();
      }
    };
  });

  document.querySelectorAll('[data-remove-cat]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.getAttribute('data-remove-cat');
      ev.categories = ev.categories.filter(c=>c.id!==id);
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-etype]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const val = el.getAttribute('data-etype');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.entryType = val;
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-crit-field]').forEach(el=>{
    el.onchange = async (e)=>{
      const catId = el.getAttribute('data-cat');
      const critKey = el.getAttribute('data-crit');
      const field = el.getAttribute('data-crit-field');
      const cat = ev.categories.find(c=>c.id===catId);
      const crit = cat.criteria.find(c=>c.key===critKey);
      if(!crit) return;
      crit[field] = field==='max' ? (parseInt(e.target.value,10)||0) : e.target.value;
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-crit-add]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-crit-add');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.criteria.push({key: uid(), label:'', max:0});
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-crit-remove]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const critKey = el.getAttribute('data-crit');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.criteria = cat.criteria.filter(c=>c.key!==critKey);
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-add-contestant]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-add-contestant');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.contestants.push({id: uid(), band:'', masquerader: cat.entryType==='individual' ? 'New contestant' : '', portrayal:'', assignedJudges: []});
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-assign-toggle]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const ctId = el.getAttribute('data-contestant');
      const judgeName = el.getAttribute('data-judge');
      const cat = ev.categories.find(c=>c.id===catId);
      const ct = cat.contestants.find(c=>c.id===ctId);
      if(ct.assignedJudges.includes(judgeName)) ct.assignedJudges = ct.assignedJudges.filter(n=>n!==judgeName);
      else ct.assignedJudges.push(judgeName);
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-remove-contestant]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat2');
      const ctId = el.getAttribute('data-remove-contestant');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.contestants = cat.contestants.filter(c=>c.id!==ctId);
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('input[data-field]').forEach(el=>{
    el.onchange = async (e)=>{
      const catId = el.getAttribute('data-cat');
      const ctId = el.getAttribute('data-contestant');
      const field = el.getAttribute('data-field');
      const cat = ev.categories.find(c=>c.id===catId);
      const ct = cat.contestants.find(c=>c.id===ctId);
      ct[field] = e.target.value;
      await saveConfig();
    };
  });
}
