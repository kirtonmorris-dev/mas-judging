import { saveConfig, saveOrganizerScoreEdit, saveScoresMerge } from '../api.js';
import { ORG_PIN, cloneTemplate, normalizeConfig } from '../constants.js';
import { fixBaltimoreCorrections, loadBaltimoreHistorical, loadWIADCAJuniorData } from '../historicalLoaders.js';
import { detectHeaderRowIndex, mapHeaderColumns } from '../importParsers.js';
import { render } from '../main.js';
import { printAllSignoffSheets, printBlankSheets, printSignoffSheet } from '../print.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';
import { catMaxTotal, currentEvent, escapeAttr, escapeHtml, uid } from '../utils.js';
import { renderJudgeDetail } from '../views/judgeDetail.js';
import { attachCategoryCardHandlers, attachCompetitionSettingsHandlers, renderCategoryCards, renderSetup } from '../views/setup.js';
import { renderEventPicker } from '../views/shared.js';
import { renderTally } from '../views/tally.js';

export function renderPinGate(){
  return `<div class="pin-wrap">
    <div class="section-title" style="color:var(--card);">Organizer access</div>
    <input type="text" id="pinInput" placeholder="PIN" inputmode="numeric" maxlength="8" style="max-width:180px; margin:0 auto 12px;">
    <br><button class="btn btn-primary" id="pinSubmit" style="max-width:180px;">Unlock</button>
    <div id="pinErr" class="err" style="display:none; max-width:260px; margin:14px auto 0;">Incorrect PIN. Ask Kirt for the organizer PIN.</div>
  </div>`;
}

export function attachPinHandlers(){
  document.getElementById('pinSubmit').onclick = ()=>{
    const val = document.getElementById('pinInput').value.trim();
    if(val === ORG_PIN){ state.orgUnlocked = true; render(); }
    else { document.getElementById('pinErr').style.display='block'; }
  };
}

export function renderOrganizer(){
  let html = renderEventPicker(true);
  const ev = currentEvent();
  if(!ev) return html;

  html += '<div class="folder-tabs">';
  html += `<span class="folder-tab ${state.orgTab==='setup'?'active':'inactive'}" data-org-tab="setup">Setup</span>`;
  html += `<span class="folder-tab ${state.orgTab==='tally'?'active':'inactive'}" data-org-tab="tally">Live Tally</span>`;
  html += `<span class="folder-tab ${state.orgTab==='detail'?'active':'inactive'}" data-org-tab="detail">Judge Detail</span>`;
  html += '</div>';

  if(state.orgTab === 'tally') html += renderTally(ev);
  else if(state.orgTab === 'detail') html += renderJudgeDetail(ev);
  else html += renderSetup(ev);
  return html;
}

export function attachOrganizerHandlers(){
  const evSel = document.getElementById('eventSelect');
  if(evSel) evSel.onchange = (e)=>{
    if(e.target.value === '__add__'){
      evSel.value = state.eventId || '';
      document.getElementById('newEventNameInline').style.display = 'block';
      document.getElementById('createEventInlineBtn').style.display = 'block';
      document.getElementById('newEventNameInline').focus();
      return;
    }
    state.eventId = e.target.value; state.categoryId=null; state.orgEditKey=null; render();
  };

  const createEventBtn = document.getElementById('createEventInlineBtn');
  if(createEventBtn) createEventBtn.onclick = async ()=>{
    const input = document.getElementById('newEventNameInline');
    const name = input.value.trim();
    if(!name) return;
    const newEv = { id: uid(), name, judges: [], categories: [] };
    state.config.events.push(newEv);
    normalizeConfig(state.config);
    await saveConfig();
    state.eventId = newEv.id;
    state.categoryId = null;
    render();
  };

  const removeEventBtn = document.getElementById('removeCurrentEventBtn');
  if(removeEventBtn) removeEventBtn.onclick = async ()=>{
    const ev = currentEvent();
    if(!ev) return;
    if(!confirm(`Remove "${ev.name}"? This deletes its judges, categories, contestants, and scores. This cannot be undone.`)) return;
    const id = ev.id;
    state.config.events = state.config.events.filter(e=>e.id!==id);
    state.eventId = state.config.events.length ? state.config.events[0].id : null;
    await saveConfig();
    await saveScoresMerge(scores=>{
      Object.keys(scores).forEach(k=>{
        if(k.startsWith(id + '|')) delete scores[k];
      });
    });
    render();
  };

  const loadHistBtn = document.getElementById('loadBaltimoreHistBtn');
  if(loadHistBtn) loadHistBtn.onclick = async ()=>{
    loadHistBtn.disabled = true;
    loadHistBtn.textContent = 'Loading\u2026';
    await loadBaltimoreHistorical();
  };

  const fixBtn = document.getElementById('fixBaltimoreBtn');
  if(fixBtn) fixBtn.onclick = async ()=>{
    fixBtn.disabled = true;
    fixBtn.textContent = 'Applying\u2026';
    await fixBaltimoreCorrections();
  };

  const loadWiadcaBtn = document.getElementById('loadWiadcaBtn');
  if(loadWiadcaBtn) loadWiadcaBtn.onclick = async ()=>{
    loadWiadcaBtn.disabled = true;
    loadWiadcaBtn.textContent = 'Loading\u2026';
    await loadWIADCAJuniorData();
  };

  const orgTabs = document.querySelectorAll('[data-org-tab]');
  orgTabs.forEach(el=>{
    el.onclick = ()=>{ state.orgTab = el.getAttribute('data-org-tab'); state.orgEditKey=null; render(); };
  });

  if(state.orgTab==='tally'){
    const sel = document.getElementById('tallyCategorySelect');
    if(sel) sel.onchange = (e)=>{ state.categoryId = e.target.value; state.tallyStageFilter=''; render(); };
    const stageSel = document.getElementById('tallyStageSelect');
    if(stageSel) stageSel.onchange = (e)=>{ state.tallyStageFilter = e.target.value; render(); };
    const ev = currentEvent();
    if(ev){
      const printSignoffBtn = document.getElementById('printSignoffBtn');
      if(printSignoffBtn) printSignoffBtn.onclick = ()=>{
        const catId = state.categoryId || (ev.categories[0] && ev.categories[0].id);
        const cat = ev.categories.find(c=>c.id===catId);
        if(!cat){ showToast('No category selected', true); return; }
        printSignoffSheet(ev, cat);
      };
      const printAllSignoffBtn = document.getElementById('printAllSignoffBtn');
      if(printAllSignoffBtn) printAllSignoffBtn.onclick = ()=> printAllSignoffSheets(ev);
    }
    return;
  }
  if(state.orgTab==='detail'){
    const sel = document.getElementById('detailCategorySelect');
    if(sel) sel.onchange = (e)=>{ state.categoryId = e.target.value; state.orgEditKey=null; render(); };

    document.querySelectorAll('[data-edit-score]').forEach(el=>{
      el.onclick = ()=>{
        const key = el.getAttribute('data-edit-score');
        delete state.orgEditDraft[key];
        state.orgEditKey = key;
        render();
      };
    });

    document.querySelectorAll('[data-cancel-score-edit]').forEach(el=>{
      el.onclick = ()=>{
        const key = el.getAttribute('data-cancel-score-edit');
        delete state.orgEditDraft[key];
        state.orgEditKey = null;
        render();
      };
    });

    document.querySelectorAll('input[data-org-edit-crit]').forEach(el=>{
      const updateOrgEditTotal = (key)=>{
        const evNow = currentEvent();
        const catId = state.categoryId || (evNow.categories[0] && evNow.categories[0].id);
        const catNow = evNow.categories.find(c=>c.id===catId);
        const total = catNow.criteria.reduce((s,c)=>s+(state.orgEditDraft[key][c.key]||0),0);
        const totalEl = document.querySelector(`[data-org-total-for="${key}"]`);
        if(totalEl) totalEl.textContent = total + ' / ' + catMaxTotal(catNow);
      };
      el.oninput = (e)=>{
        const key = el.getAttribute('data-org-edit-key');
        const critKey = el.getAttribute('data-org-edit-crit');
        let v = parseInt(e.target.value,10);
        if(isNaN(v)) v = 0;
        state.orgEditDraft[key][critKey] = v;
        updateOrgEditTotal(key);
      };
      el.onblur = (e)=>{
        const key = el.getAttribute('data-org-edit-key');
        const critKey = el.getAttribute('data-org-edit-crit');
        const evNow = currentEvent();
        const catId = state.categoryId || (evNow.categories[0] && evNow.categories[0].id);
        const catNow = evNow.categories.find(c=>c.id===catId);
        const crit = catNow.criteria.find(c=>c.key===critKey);
        let v = parseInt(e.target.value,10);
        if(isNaN(v) || v<0) v = 0;
        if(crit && v>crit.max) v = crit.max;
        e.target.value = v;
        state.orgEditDraft[key][critKey] = v;
        updateOrgEditTotal(key);
      };
    });

    document.querySelectorAll('input[data-org-edit-total]').forEach(el=>{
      el.oninput = (e)=>{
        const key = el.getAttribute('data-org-edit-total');
        let v = parseInt(e.target.value,10);
        if(isNaN(v)) v = 0;
        state.orgEditDraft[key].total = v;
      };
      el.onblur = (e)=>{
        const key = el.getAttribute('data-org-edit-total');
        const evNow = currentEvent();
        const catId = state.categoryId || (evNow.categories[0] && evNow.categories[0].id);
        const catNow = evNow.categories.find(c=>c.id===catId);
        const max = catMaxTotal(catNow);
        let v = parseInt(e.target.value,10);
        if(isNaN(v) || v<0) v = 0;
        if(v>max) v = max;
        e.target.value = v;
        state.orgEditDraft[key].total = v;
      };
    });

    document.querySelectorAll('[data-save-score-edit]').forEach(el=>{
      el.onclick = async ()=>{
        const key = el.getAttribute('data-save-score-edit');
        el.disabled = true;
        el.textContent = 'Saving…';
        const ok = await saveOrganizerScoreEdit(key);
        if(ok){
          delete state.orgEditDraft[key];
          state.orgEditKey = null;
          showToast('Score updated');
          render();
        } else {
          el.disabled = false;
          el.textContent = 'Save';
        }
      };
    });

    return;
  }

  const ev = currentEvent();
  if(!ev) return;

  attachCompetitionSettingsHandlers(ev);

  const printBlankBtn = document.getElementById('printBlankSheetsBtn');
  if(printBlankBtn) printBlankBtn.onclick = ()=> printBlankSheets(ev);

  const addJudgeBtn = document.getElementById('setupAddJudge');
  if(addJudgeBtn) addJudgeBtn.onclick = async ()=>{
    const input = document.getElementById('setupNewJudge');
    const realName = input.value.trim();
    if(!realName) return;
    const nums = ev.judges.map(j=>{ const m = /^Judge\s+(\d+)$/i.exec(j.name||''); return m ? parseInt(m[1],10) : 0; });
    const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
    const maskedName = 'Judge ' + nextNum;
    ev.judges.push({name: maskedName, realName, pin:null});
    await saveConfig();
    render();
  };
  document.querySelectorAll('[data-remove-judge]').forEach(el=>{
    el.onclick = async ()=>{
      const name = el.getAttribute('data-remove-judge');
      ev.judges = ev.judges.filter(j=>j.name!==name);
      ev.categories.forEach(cat=>{
        cat.contestants.forEach(ct=>{ ct.assignedJudges = ct.assignedJudges.filter(n=>n!==name); });
      });
      await saveConfig();
      render();
    };
  });
  document.querySelectorAll('[data-reset-pin]').forEach(el=>{
    el.onclick = async ()=>{
      const name = el.getAttribute('data-reset-pin');
      const judgeObj = ev.judges.find(j=>j.name===name);
      if(judgeObj){ judgeObj.pin = null; await saveConfig(); render(); showToast(`PIN reset for ${name}`); }
    };
  });

  const addCatBtn = document.getElementById('setupAddCategory');
  if(addCatBtn) addCatBtn.onclick = async ()=>{
    const input = document.getElementById('setupNewCategory');
    const name = input.value.trim();
    if(!name) return;
    ev.categories.push({id: uid(), name, entryType:'individual', criteria: cloneTemplate(), contestants: []});
    await saveConfig();
    render();
  };
  attachCategoryCardHandlers(ev);

  const filterInput = document.getElementById('categoryFilterInput');
  if(filterInput) filterInput.oninput = (e)=>{
    state.categoryFilter = e.target.value;
    const container = document.getElementById('categoriesListContainer');
    if(container){
      container.innerHTML = renderCategoryCards(ev);
      attachCategoryCardHandlers(ev);
    }
  };

  const importTargetSel = document.getElementById('importTargetCategory');
  if(importTargetSel) importTargetSel.onchange = ()=>{
    const nameInput = document.getElementById('importNewCategoryName');
    nameInput.style.display = importTargetSel.value === '__new__' ? 'block' : 'none';
  };

  const importFile = document.getElementById('eventImportFile');
  if(importFile) importFile.onchange = async (e)=>{
    const statusEl = document.getElementById('eventImportStatus');
    const file = e.target.files[0];
    if(!file) return;
    const targetSel = document.getElementById('importTargetCategory');
    const targetVal = targetSel.value;
    if(!targetVal){
      statusEl.className = 'import-status err';
      statusEl.textContent = 'Choose a category to import into first.';
      e.target.value = '';
      return;
    }
    let targetCat;
    if(targetVal === '__new__'){
      const newName = document.getElementById('importNewCategoryName').value.trim();
      if(!newName){
        statusEl.className = 'import-status err';
        statusEl.textContent = 'Enter a name for the new category first.';
        e.target.value = '';
        return;
      }
      targetCat = { id: uid(), name: newName, entryType:'individual', criteria: cloneTemplate(), contestants: [] };
      ev.categories.push(targetCat);
    } else {
      targetCat = ev.categories.find(c=>c.id===targetVal);
    }
    statusEl.className = 'import-status';
    statusEl.textContent = 'Reading file\u2026';
    try{
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
      let added = 0, skipped = 0, duplicates = 0;
      const isGroup = targetCat.entryType === 'group';
      rows.forEach(row=>{
        const mapped = {band:'', masquerader:'', portrayal:''};
        Object.keys(row).forEach(k=>{
          const key = k.toString().trim().toLowerCase();
          const val = (row[k]??'').toString().trim();
          if(['band','mas band','band name','name of the band'].includes(key)) mapped.band = val;
          else if(['masquerader','masquerader name','name of the masquerader','name'].includes(key)) mapped.masquerader = val;
          else if(['portrayal','title','portrayal title','name of the portrayal'].includes(key)) mapped.portrayal = val;
        });
        if(isGroup){
          if(!mapped.band){ skipped++; return; }
        } else {
          if(!mapped.masquerader){ skipped++; return; }
        }
        const dup = targetCat.contestants.find(ct =>
          ct.band.trim().toLowerCase() === mapped.band.trim().toLowerCase() &&
          ct.portrayal.trim().toLowerCase() === mapped.portrayal.trim().toLowerCase() &&
          (isGroup || ct.masquerader.trim().toLowerCase() === mapped.masquerader.trim().toLowerCase())
        );
        if(dup){ duplicates++; return; }
        targetCat.contestants.push({id: uid(), band: mapped.band, masquerader: isGroup ? '' : mapped.masquerader, portrayal: mapped.portrayal, assignedJudges: []});
        added++;
      });
      if(added===0){
        statusEl.className = 'import-status err';
        statusEl.textContent = isGroup ? 'No new entries imported. Check that a Band column exists and is filled in.' : 'No new contestants imported. Check that a Masquerader column exists and is filled in.';
      } else {
        await saveConfig();
        let msg = `Imported ${added} entr${added!==1?'ies':'y'} into "${targetCat.name}"`;
        if(duplicates) msg += `. Collapsed ${duplicates} duplicate row(s) (same entry, repeated per judge)`;
        if(skipped) msg += `. Skipped ${skipped} row(s) missing a required name`;
        msg += '. Now assign judges to each entry below.';
        statusEl.className = 'import-status ok';
        statusEl.textContent = msg;
        showToast(`Imported ${added} entr${added!==1?'ies':'y'}`);
        render();
      }
    }catch(err){
      console.error('import failed', err);
      statusEl.className = 'import-status err';
      statusEl.textContent = 'Could not read that file. Try exporting as .csv or .xlsx.';
    }
    e.target.value = '';
  };

  let pendingWorkbook = null;

  const workbookFile = document.getElementById('workbookImportFile');
  if(workbookFile) workbookFile.onchange = async (e)=>{
    const statusEl = document.getElementById('workbookImportStatus');
    const file = e.target.files[0];
    if(!file) return;
    statusEl.className = 'import-status';
    statusEl.textContent = 'Reading file\u2026';
    try{
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      pendingWorkbook = wb;
      const wrap = document.getElementById('workbookSheetWrap');
      const sel = document.getElementById('workbookSheetSelect');
      sel.innerHTML = wb.SheetNames.map(n=>`<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
      wrap.style.display = 'block';
      statusEl.className = '';
      statusEl.textContent = `Found ${wb.SheetNames.length} sheet${wb.SheetNames.length!==1?'s':''}. Choose one and click Import.`;
    }catch(err){
      console.error('workbook read failed', err);
      statusEl.className = 'import-status err';
      statusEl.textContent = 'Could not read that file.';
      pendingWorkbook = null;
    }
    e.target.value = '';
  };

  const workbookGoBtn = document.getElementById('workbookSheetGoBtn');
  if(workbookGoBtn) workbookGoBtn.onclick = async ()=>{
    const statusEl = document.getElementById('workbookImportStatus');
    if(!pendingWorkbook){ statusEl.className='import-status err'; statusEl.textContent='Choose a file first.'; return; }
    const sel = document.getElementById('workbookSheetSelect');
    const sheetName = sel.value;
    const sheet = pendingWorkbook.Sheets[sheetName];
    if(!sheet){ statusEl.className='import-status err'; statusEl.textContent='Could not read that sheet.'; return; }

    const aoa = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
    const headerIdx = detectHeaderRowIndex(aoa);
    const headerRow = aoa[headerIdx] || [];
    const mapping = mapHeaderColumns(headerRow);
    if(mapping.bandIdx<0 && mapping.masqIdx<0 && mapping.portIdx<0){
      statusEl.className = 'import-status err';
      statusEl.textContent = 'Could not find Band / Masquerader / Portrayal columns on this sheet.';
      return;
    }

    const entryType = mapping.masqIdx>=0 ? 'individual' : 'group';
    const criteria = mapping.criteriaCols.length ? mapping.criteriaCols.map(c=>({key:uid(), label:c.label, max:c.max})) : cloneTemplate();

    let targetCat = ev.categories.find(c=>c.name.toLowerCase()===sheetName.toLowerCase());
    let isNew = false;
    if(!targetCat){
      targetCat = { id: uid(), name: sheetName, entryType, criteria, contestants: [] };
      ev.categories.push(targetCat);
      isNew = true;
    }

    let added=0, skipped=0, duplicates=0;
    const isGroup = targetCat.entryType === 'group';
    for(let r=headerIdx+1; r<aoa.length; r++){
      const row = aoa[r] || [];
      if(row.every(c=>String(c||'').trim()==='')) continue;
      const band = mapping.bandIdx>=0 ? String(row[mapping.bandIdx]||'').trim() : '';
      const masq = mapping.masqIdx>=0 ? String(row[mapping.masqIdx]||'').trim() : '';
      const port = mapping.portIdx>=0 ? String(row[mapping.portIdx]||'').trim() : '';
      if(isGroup){ if(!band){ skipped++; continue; } }
      else { if(!masq){ skipped++; continue; } }
      const dup = targetCat.contestants.find(ct =>
        ct.band.trim().toLowerCase() === band.trim().toLowerCase() &&
        ct.portrayal.trim().toLowerCase() === port.trim().toLowerCase() &&
        (isGroup || ct.masquerader.trim().toLowerCase() === masq.trim().toLowerCase())
      );
      if(dup){ duplicates++; continue; }
      targetCat.contestants.push({id: uid(), band, masquerader: isGroup?'':masq, portrayal: port, assignedJudges: []});
      added++;
    }

    if(added===0){
      if(isNew) ev.categories = ev.categories.filter(c=>c.id!==targetCat.id);
      statusEl.className = 'import-status err';
      statusEl.textContent = `No contestants found on "${sheetName}". Check the sheet has data below the header row.`;
      return;
    }

    await saveConfig();
    let msg = `${isNew?'Created':'Updated'} category "${targetCat.name}" (${targetCat.entryType}) with ${added} entr${added!==1?'ies':'y'}`;
    if(duplicates) msg += `, collapsed ${duplicates} duplicate row(s)`;
    if(skipped) msg += `, skipped ${skipped} row(s) missing a name`;
    msg += '. Now assign judges to it below.';
    statusEl.className = 'import-status ok';
    statusEl.textContent = msg;
    showToast(`Imported "${sheetName}"`);
    render();
  };
}
