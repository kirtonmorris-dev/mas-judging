import { saveConfig } from '../api.js';
import { COMPETITION_FAMILIES, EXTRA_FIELD_DEFS, SCOPE_OPTIONS, getFamily, getTemplate, templatesForFamily } from '../competitionLibrary.js';
import { render } from '../main.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';
import { catMaxTotal, entityLabel, escapeAttr, escapeHtml, sortContestants, uid } from '../utils.js';

export function renderSetup(ev){
  let html = '';
  html += renderCompetitionSettings(ev);
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

export function renderCompetitionSettings(ev){
  if(!ev.fieldLabels) ev.fieldLabels = {};
  if(!ev.fieldLabels.primary) ev.fieldLabels.primary = 'Band';
  if(!ev.fieldLabels.secondary) ev.fieldLabels.secondary = 'Masquerader';
  if(!ev.fieldLabels.detail) ev.fieldLabels.detail = 'Portrayal';
  if(!ev.contestantLabel) ev.contestantLabel = 'Band';
  if(!ev.contestantLabelPlural) ev.contestantLabelPlural = 'Bands';
  if(!ev.scope) ev.scope = 'community';
  if(ev.active === undefined) ev.active = true;

  const expanded = !!state.expandedCompetitionSettings;
  const family = getFamily(ev.competitionFamily);
  const template = ev.competitionType ? getTemplate(ev.competitionType) : null;
  const summaryParts = [family ? family.name : 'Custom competition', template ? template.name : null, ev.active ? 'Active' : 'Inactive'];
  const summary = summaryParts.filter(Boolean).join(' · ');

  let html = `<div class="card">`;
  html += `<div data-competition-settings-toggle style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
      <div>
        <b>Competition</b>
        <div style="font-size:0.75rem; color:var(--ink-soft); margin-top:2px;">${escapeHtml(summary)}</div>
      </div>
      <span style="font-size:1.1rem; color:var(--ink-soft);">${expanded?'&#9662;':'&#9656;'}</span>
    </div>`;

  if(expanded){
    html += `<div style="margin-top:14px;">`;
    html += `<label>Competition family</label>
      <select id="competitionFamilySelect">
        <option value="">Custom / Unassigned</option>
        ${COMPETITION_FAMILIES.map(f=>`<option value="${f.id}" ${ev.competitionFamily===f.id?'selected':''}>${escapeHtml(f.name)}</option>`).join('')}
      </select>`;

    const templates = ev.competitionFamily ? templatesForFamily(ev.competitionFamily) : [];
    html += `<label>Competition type</label>
      <select id="competitionTypeSelect" ${templates.length===0?'disabled':''}>
        <option value="">Custom competition name</option>
        ${templates.map(t=>`<option value="${t.id}" ${ev.competitionType===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}
      </select>`;
    if(templates.length===0){
      html += `<div class="small-note" style="margin-top:-8px; margin-bottom:14px; text-align:left;">Choose a family above to see suggested competition types, or leave this event as a custom competition.</div>`;
    }

    html += `<div class="row">
        <div><label>${escapeHtml(entityLabel(ev,false))} label (singular)</label><input type="text" id="contestantLabelInput" value="${escapeAttr(ev.contestantLabel)}"></div>
        <div><label>${escapeHtml(entityLabel(ev,true))} label (plural)</label><input type="text" id="contestantLabelPluralInput" value="${escapeAttr(ev.contestantLabelPlural)}"></div>
      </div>`;

    html += `<div class="row">
        <div><label>Primary field</label><input type="text" id="fieldLabelPrimaryInput" value="${escapeAttr(ev.fieldLabels.primary)}"></div>
        <div><label>Secondary field</label><input type="text" id="fieldLabelSecondaryInput" value="${escapeAttr(ev.fieldLabels.secondary)}"></div>
        <div><label>Detail field</label><input type="text" id="fieldLabelDetailInput" value="${escapeAttr(ev.fieldLabels.detail)}"></div>
      </div>
      <div class="small-note" style="margin-top:-8px; text-align:left;">These relabel the three entry fields below (e.g. for a Calypso competition: Primary = "Tent", Secondary = "Performer", Detail = "Song Title"). The underlying entries, scores, and tallies are unaffected.</div>`;

    html += `<label style="margin-top:14px;">Scope</label>
      <select id="competitionScopeSelect">
        ${SCOPE_OPTIONS.map(s=>`<option value="${s}" ${ev.scope===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
      </select>`;

    html += `<div class="chip-row" style="margin-top:2px;">
        <span class="chip etype ${ev.active?'on':''}" data-toggle-active>${ev.active ? '✓ Active for this Carnival' : 'Inactive for this Carnival'}</span>
      </div>`;

    if(template){
      html += `<button class="btn btn-outline btn-small" id="addCategoryFromTemplateBtn" style="width:100%; margin-top:10px;">+ Add a &ldquo;${escapeHtml(template.name)}&rdquo; category${template.defaultCriteria?' with suggested criteria':''}</button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

export function attachCompetitionSettingsHandlers(ev){
  const toggle = document.querySelector('[data-competition-settings-toggle]');
  if(toggle) toggle.onclick = ()=>{ state.expandedCompetitionSettings = !state.expandedCompetitionSettings; render(); };

  const familySel = document.getElementById('competitionFamilySelect');
  if(familySel) familySel.onchange = async (e)=>{
    ev.competitionFamily = e.target.value || null;
    ev.competitionType = null;
    const fam = getFamily(ev.competitionFamily);
    if(fam){ ev.contestantLabel = fam.contestantLabel; ev.contestantLabelPlural = fam.contestantLabelPlural; }
    await saveConfig();
    render();
  };

  const typeSel = document.getElementById('competitionTypeSelect');
  if(typeSel) typeSel.onchange = async (e)=>{
    ev.competitionType = e.target.value || null;
    await saveConfig();
    render();
  };

  const labelIn = document.getElementById('contestantLabelInput');
  if(labelIn) labelIn.onchange = async (e)=>{ ev.contestantLabel = e.target.value.trim() || ev.contestantLabel; await saveConfig(); render(); };
  const labelPluralIn = document.getElementById('contestantLabelPluralInput');
  if(labelPluralIn) labelPluralIn.onchange = async (e)=>{ ev.contestantLabelPlural = e.target.value.trim() || ev.contestantLabelPlural; await saveConfig(); render(); };

  const fPrimary = document.getElementById('fieldLabelPrimaryInput');
  if(fPrimary) fPrimary.onchange = async (e)=>{ ev.fieldLabels.primary = e.target.value.trim() || ev.fieldLabels.primary; await saveConfig(); render(); };
  const fSecondary = document.getElementById('fieldLabelSecondaryInput');
  if(fSecondary) fSecondary.onchange = async (e)=>{ ev.fieldLabels.secondary = e.target.value.trim() || ev.fieldLabels.secondary; await saveConfig(); render(); };
  const fDetail = document.getElementById('fieldLabelDetailInput');
  if(fDetail) fDetail.onchange = async (e)=>{ ev.fieldLabels.detail = e.target.value.trim() || ev.fieldLabels.detail; await saveConfig(); render(); };

  const scopeSel = document.getElementById('competitionScopeSelect');
  if(scopeSel) scopeSel.onchange = async (e)=>{ ev.scope = e.target.value; await saveConfig(); render(); };

  const activeToggle = document.querySelector('[data-toggle-active]');
  if(activeToggle) activeToggle.onclick = async ()=>{ ev.active = !ev.active; await saveConfig(); render(); };

  const addCatBtn = document.getElementById('addCategoryFromTemplateBtn');
  if(addCatBtn) addCatBtn.onclick = async ()=>{
    const template = ev.competitionType ? getTemplate(ev.competitionType) : null;
    if(!template) return;
    const newCat = {
      id: uid(), name: template.name, entryType: template.entryTypeDefault || 'individual',
      criteria: template.defaultCriteria ? template.defaultCriteria.map(c=>({...c})) : [{key: uid(), label:'', max:0}],
      contestants: [],
      stages: template.supportsStages ? ['Preliminary','Final'] : [],
      extraFields: template.extraFieldsDefault ? template.extraFieldsDefault.filter(k=>EXTRA_FIELD_DEFS[k]) : [],
    };
    ev.categories.push(newCat);
    await saveConfig();
    showToast(`Added "${template.name}" category`);
    render();
  };
}

function renderStagesBox(cat){
  const stages = cat.stages || [];
  let html = `<div class="crit-box"><label>Stages / rounds (optional)</label>`;
  if(stages.length===0){
    html += `<div class="small-note" style="margin:0 0 8px; text-align:left;">No stages configured. Contestants are scored directly, same as today.</div>`;
  } else {
    html += `<div class="chip-row" style="margin-bottom:8px;">`;
    stages.forEach(s=>{
      html += `<span class="chip"><b>${escapeHtml(s)}</b><button data-stage-remove data-cat="${cat.id}" data-stage="${escapeAttr(s)}">&times;</button></span>`;
    });
    html += `</div>`;
  }
  html += `<div class="row"><input type="text" id="newStageInput-${cat.id}" placeholder="Stage name (e.g. Preliminary)"><button class="btn btn-outline btn-small" data-stage-add="${cat.id}" style="flex:0 0 auto;">Add</button></div>`;
  html += `</div>`;
  return html;
}

function renderExtraFieldsBox(cat){
  const extraFields = cat.extraFields || [];
  const availableKeys = Object.keys(EXTRA_FIELD_DEFS).filter(k=>!extraFields.includes(k));
  let html = `<div class="crit-box"><label>Extra entry details (optional)</label>`;
  if(extraFields.length===0){
    html += `<div class="small-note" style="margin:0 0 8px; text-align:left;">No extra fields configured (e.g. School, Age Group, Region).</div>`;
  } else {
    html += `<div class="chip-row" style="margin-bottom:8px;">`;
    extraFields.forEach(fk=>{
      const def = EXTRA_FIELD_DEFS[fk];
      html += `<span class="chip"><b>${escapeHtml(def ? def.label : fk)}</b><button data-extra-field-remove data-cat="${cat.id}" data-extra-key="${escapeAttr(fk)}">&times;</button></span>`;
    });
    html += `</div>`;
  }
  if(availableKeys.length){
    html += `<div class="row"><select id="newExtraFieldSelect-${cat.id}">
        ${availableKeys.map(k=>`<option value="${k}">${escapeHtml(EXTRA_FIELD_DEFS[k].label)}</option>`).join('')}
      </select><button class="btn btn-outline btn-small" data-extra-field-add="${cat.id}" style="flex:0 0 auto;">Add</button></div>`;
  }
  html += `</div>`;
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
          <div style="font-size:0.75rem; color:var(--ink-soft); margin-top:2px;">${cat.entryType==='group'?'Group':'Individual'} &middot; ${cat.contestants.length} ${escapeHtml(entityLabel(ev, cat.contestants.length!==1)).toLowerCase()} &middot; ${maxTotal} pts</div>
        </div>
        <span style="font-size:1.1rem; color:var(--ink-soft);">${expanded?'&#9662;':'&#9656;'}</span>
      </div>`;

    if(expanded){
      const primaryLabel = ev.fieldLabels.primary, secondaryLabel = ev.fieldLabels.secondary, detailLabel = ev.fieldLabels.detail;
      html += `<div style="margin-top:14px;">`;
      html += `<div class="entry-type-row"><label>Entry type</label><div class="chip-row" style="margin-bottom:0;">
          <span class="chip etype ${cat.entryType==='individual'?'on':''}" data-etype="individual" data-cat="${cat.id}">Individual (${escapeHtml(primaryLabel)} + ${escapeHtml(secondaryLabel)} + ${escapeHtml(detailLabel)})</span>
          <span class="chip etype ${cat.entryType==='group'?'on':''}" data-etype="group" data-cat="${cat.id}">Group (${escapeHtml(primaryLabel)} + ${escapeHtml(detailLabel)} only)</span>
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

      html += renderStagesBox(cat);
      html += renderExtraFieldsBox(cat);

      const ctFilterRaw = state.contestantFilters[cat.id] || '';
      const ctFilter = ctFilterRaw.trim().toLowerCase();
      const entityPluralLower = escapeHtml(entityLabel(ev, true)).toLowerCase();
      if(cat.contestants.length > 5){
        html += `<div style="margin:14px 0 10px;"><input type="text" data-contestant-filter="${cat.id}" placeholder="Filter ${entityPluralLower}&hellip;" value="${escapeAttr(ctFilterRaw)}"></div>`;
      }
      const visibleContestants = sortContestants(cat, cat.contestants).filter(ct=>{
        if(!ctFilter) return true;
        const hay = [ct.band, ct.masquerader, ct.portrayal].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(ctFilter);
      });
      if(cat.contestants.length>0 && visibleContestants.length===0){
        html += `<div class="empty">No ${entityPluralLower} match your filter.</div>`;
      }

      visibleContestants.forEach(ct=>{
        html += `<div class="contestant-row">
          <div class="row"><div><label>${escapeHtml(primaryLabel)}</label><input type="text" value="${escapeAttr(ct.band)}" data-field="band" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;
        if(cat.entryType === 'individual'){
          html += `<div class="row"><div><label>${escapeHtml(secondaryLabel)}</label><input type="text" value="${escapeAttr(ct.masquerader)}" data-field="masquerader" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;
        }
        html += `<div class="row"><div><label>${escapeHtml(detailLabel)}</label><input type="text" value="${escapeAttr(ct.portrayal)}" data-field="portrayal" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;

        if((cat.extraFields||[]).length){
          cat.extraFields.forEach(fk=>{
            const def = EXTRA_FIELD_DEFS[fk];
            if(!def) return;
            const extra = ct.extra || {};
            html += `<div class="row"><div><label>${escapeHtml(def.label)}</label><input type="text" value="${escapeAttr(extra[fk]||'')}" data-extra-field="${fk}" data-cat="${cat.id}" data-contestant="${ct.id}"></div></div>`;
          });
        }

        if((cat.stages||[]).length){
          html += `<div class="assign-label">Stage</div><div class="chip-row" style="margin-bottom:8px;">`;
          cat.stages.forEach(stageName=>{
            const on = ct.stage === stageName;
            html += `<span class="chip assign ${on?'on':'off'}" data-stage-toggle data-cat="${cat.id}" data-contestant="${ct.id}" data-stage="${escapeAttr(stageName)}">${escapeHtml(stageName)}</span>`;
          });
          html += `</div>`;
        }

        html += `<div class="assign-label">Assigned judges</div>
          <div class="chip-row" style="margin-bottom:8px;">`;
        if(ev.judges.length===0){
          html += `<span style="font-size:0.8rem; color:var(--ink-soft);">Add judges above first.</span>`;
        }
        ev.judges.forEach(j=>{
          const on = ct.assignedJudges.includes(j.name);
          html += `<span class="chip assign ${on?'on':'off'}" data-assign-toggle data-cat="${cat.id}" data-contestant="${ct.id}" data-judge="${escapeAttr(j.name)}">${escapeHtml(j.name)}</span>`;
        });
        html += `</div>
          <button class="btn-danger" data-remove-contestant="${ct.id}" data-cat2="${cat.id}">Remove ${escapeHtml(entityLabel(ev,false)).toLowerCase()}</button>
        </div>`;
      });
      html += `<button class="btn btn-outline btn-small" data-add-contestant="${cat.id}">+ Add ${escapeHtml(entityLabel(ev,false)).toLowerCase()}</button>`;
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
  document.querySelectorAll('input[data-contestant-filter]').forEach(el=>{
    el.oninput = (e)=>{
      const catId = el.getAttribute('data-contestant-filter');
      state.contestantFilters[catId] = e.target.value;
      const cursorPos = e.target.selectionStart;
      const container = document.getElementById('categoriesListContainer');
      if(container){
        container.innerHTML = renderCategoryCards(ev);
        attachCategoryCardHandlers(ev);
        const newInput = container.querySelector(`input[data-contestant-filter="${catId}"]`);
        if(newInput){ newInput.focus(); newInput.setSelectionRange(cursorPos, cursorPos); }
      }
    };
  });

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
      const cat = ev.categories.find(c=>c.id===id);
      const count = cat ? cat.contestants.length : 0;
      const label = cat ? entityLabel(ev, count!==1).toLowerCase() : 'entries';
      if(!confirm(`Remove category "${cat ? cat.name : ''}" and its ${count} ${label}? This cannot be undone.`)) return;
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
      cat.contestants.push({id: uid(), band:'', masquerader: cat.entryType==='individual' ? ('New '+entityLabel(ev,false).toLowerCase()) : '', portrayal:'', assignedJudges: [], extra:{}});
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
      const ct = cat.contestants.find(c=>c.id===ctId);
      const label = ct ? (ct.band || ct.masquerader || `this ${entityLabel(ev,false).toLowerCase()}`) : `this ${entityLabel(ev,false).toLowerCase()}`;
      if(!confirm(`Remove "${label}"? This cannot be undone.`)) return;
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

  document.querySelectorAll('input[data-extra-field]').forEach(el=>{
    el.onchange = async (e)=>{
      const catId = el.getAttribute('data-cat');
      const ctId = el.getAttribute('data-contestant');
      const key = el.getAttribute('data-extra-field');
      const cat = ev.categories.find(c=>c.id===catId);
      const ct = cat.contestants.find(c=>c.id===ctId);
      if(!ct.extra) ct.extra = {};
      ct.extra[key] = e.target.value;
      await saveConfig();
    };
  });

  document.querySelectorAll('[data-stage-add]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-stage-add');
      const cat = ev.categories.find(c=>c.id===catId);
      if(!Array.isArray(cat.stages)) cat.stages = [];
      const input = document.getElementById(`newStageInput-${catId}`);
      const name = input.value.trim();
      if(!name || cat.stages.includes(name)) return;
      cat.stages.push(name);
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-stage-remove]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const stageName = el.getAttribute('data-stage');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.stages = (cat.stages||[]).filter(s=>s!==stageName);
      cat.contestants.forEach(ct=>{ if(ct.stage===stageName) delete ct.stage; });
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-stage-toggle]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const ctId = el.getAttribute('data-contestant');
      const stageName = el.getAttribute('data-stage');
      const cat = ev.categories.find(c=>c.id===catId);
      const ct = cat.contestants.find(c=>c.id===ctId);
      ct.stage = ct.stage === stageName ? undefined : stageName;
      await saveConfig();
      render();
    };
  });

  document.querySelectorAll('[data-extra-field-add]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-extra-field-add');
      const cat = ev.categories.find(c=>c.id===catId);
      if(!Array.isArray(cat.extraFields)) cat.extraFields = [];
      const sel = document.getElementById(`newExtraFieldSelect-${catId}`);
      const key = sel.value;
      if(!key || cat.extraFields.includes(key)) return;
      cat.extraFields.push(key);
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-extra-field-remove]').forEach(el=>{
    el.onclick = async ()=>{
      const catId = el.getAttribute('data-cat');
      const key = el.getAttribute('data-extra-key');
      const cat = ev.categories.find(c=>c.id===catId);
      cat.extraFields = (cat.extraFields||[]).filter(k=>k!==key);
      await saveConfig();
      render();
    };
  });
}
