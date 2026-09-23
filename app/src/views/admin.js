// Admin view -- reached ONLY via /app?admin=1, gated by its own PIN
// (ADMIN_PIN, separate from ORG_PIN). This is the one place in the app
// allowed to see every client and every event side by side, and the only
// place that can mint a new event. It never shares a query with the judge
// or organizer views (see api.js's adminListEvents/adminListClients/
// adminCreateEvent, all separate RPCs from the event-scoped ones those
// views use) -- so there is no flag anywhere that widens a normal
// session's access into this one.
import { adminCreateClient, adminCreateEvent, adminListClients, adminListEvents } from '../api.js';
import { ADMIN_PIN } from '../constants.js';
import { render } from '../main.js';
import { state } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils.js';

function linkFor(eventId, mode){
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('event', eventId);
  if(mode === 'organizer') url.searchParams.set('mode', 'organizer');
  return url.toString();
}

export function renderAdminGate(){
  return `<div class="pin-wrap">
    <div class="section-title" style="color:var(--ink);">Admin access</div>
    <input type="text" id="adminPinInput" placeholder="Admin PIN" inputmode="numeric" style="max-width:180px; margin:0 auto 12px;">
    <br><button class="btn btn-primary" id="adminPinSubmit" style="max-width:180px;">Unlock</button>
    <div id="adminPinErr" class="err" style="display:none; max-width:260px; margin:14px auto 0;">Incorrect PIN.</div>
  </div>`;
}

export function attachAdminGateHandlers(){
  document.getElementById('adminPinSubmit').onclick = ()=>{
    const val = document.getElementById('adminPinInput').value.trim();
    if(val === ADMIN_PIN){ state.adminUnlocked = true; render(); }
    else { document.getElementById('adminPinErr').style.display='block'; }
  };
}

export function renderAdmin(){
  if(state.adminClients === null || state.adminEvents === null){
    return '<div class="empty">Loading clients and events&hellip;</div>';
  }

  let html = '<div class="card"><div class="section-title" style="color:var(--ink);">Clients &amp; events</div>';
  if(!state.adminEvents.length){
    html += '<div class="empty">No events yet.</div>';
  } else {
    const byClient = {};
    state.adminEvents.forEach(ev=>{
      (byClient[ev.clientName] = byClient[ev.clientName] || []).push(ev);
    });
    Object.keys(byClient).sort().forEach(clientName=>{
      html += `<div style="margin-top:14px;"><b>${escapeHtml(clientName)}</b></div>`;
      byClient[clientName].forEach(ev=>{
        html += `<div class="contestant-item" style="cursor:default;">
          <div class="info"><b>${escapeHtml(ev.name)}</b><span>${ev.active ? 'active' : 'inactive'}</span></div>
          <span style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-small" data-copy-link="${escapeAttr(linkFor(ev.id,'judge'))}">Judge link</button>
            <button class="btn btn-outline btn-small" data-copy-link="${escapeAttr(linkFor(ev.id,'organizer'))}">Organizer link</button>
          </span>
        </div>`;
      });
    });
  }
  html += '</div>';

  html += `<div class="card">
    <div class="section-title" style="color:var(--ink);">Create new event</div>
    <label>Client</label>
    <select id="adminNewEventClient">
      <option value="">Select client&hellip;</option>
      ${state.adminClients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
      <option value="__new__">+ Add new client&hellip;</option>
    </select>
    <input type="text" id="adminNewClientName" placeholder="New client name" style="display:none; margin-top:8px;">
    <button class="btn btn-outline btn-small" id="adminCreateClientBtn" style="display:none; margin-top:8px;">Add client</button>
    <label style="margin-top:10px;">Event name</label>
    <input type="text" id="adminNewEventName" placeholder="e.g. WIADCA — J'ouvert 2027">
    <button class="btn btn-primary btn-small" id="adminCreateEventBtn" style="margin-top:10px;">Create event</button>
    <div id="adminCreateErr" class="err" style="display:none; margin-top:10px;"></div>
  </div>`;

  return html;
}

export async function loadAdminData(){
  try{
    const [clients, events] = await Promise.all([adminListClients(), adminListEvents()]);
    state.adminClients = clients;
    state.adminEvents = events;
  }catch(e){
    console.error('admin data load failed', e);
    state.adminClients = [];
    state.adminEvents = [];
  }
  render();
}

export function attachAdminHandlers(){
  document.querySelectorAll('[data-copy-link]').forEach(btn=>{
    btn.onclick = async ()=>{
      const link = btn.getAttribute('data-copy-link');
      window.open(link, '_blank', 'noopener');
      try{ await navigator.clipboard.writeText(link); btn.textContent = 'Copied!'; setTimeout(()=>{ btn.textContent = btn.textContent==='Copied!' ? (link.includes('mode=organizer')?'Organizer link':'Judge link') : btn.textContent; }, 1500); }
      catch(e){ prompt('Copy this link:', link); }
    };
  });

  const clientSel = document.getElementById('adminNewEventClient');
  if(clientSel) clientSel.onchange = ()=>{
    const isNew = clientSel.value === '__new__';
    document.getElementById('adminNewClientName').style.display = isNew ? 'block' : 'none';
    document.getElementById('adminCreateClientBtn').style.display = isNew ? 'block' : 'none';
    if(isNew) document.getElementById('adminNewClientName').focus();
  };

  const createClientBtn = document.getElementById('adminCreateClientBtn');
  if(createClientBtn) createClientBtn.onclick = async ()=>{
    const nameInput = document.getElementById('adminNewClientName');
    const name = nameInput.value.trim();
    const errEl = document.getElementById('adminCreateErr');
    errEl.style.display = 'none';
    if(!name){
      errEl.textContent = 'Enter a client name.';
      errEl.style.display = 'block';
      return;
    }
    createClientBtn.disabled = true;
    createClientBtn.textContent = 'Adding…';
    try{
      const newClientId = await adminCreateClient(name);
      const clients = await adminListClients();
      state.adminClients = clients;
      const sel = document.getElementById('adminNewEventClient');
      sel.innerHTML = '<option value="">Select client&hellip;</option>'
        + clients.map(c=>`<option value="${c.id}" ${c.id===newClientId?'selected':''}>${escapeHtml(c.name)}</option>`).join('')
        + '<option value="__new__">+ Add new client&hellip;</option>';
      nameInput.value = '';
      nameInput.style.display = 'none';
      createClientBtn.style.display = 'none';
      createClientBtn.disabled = false;
      createClientBtn.textContent = 'Add client';
    }catch(e){
      console.error('create client failed', e);
      errEl.textContent = 'Could not add client — check connection.';
      errEl.style.display = 'block';
      createClientBtn.disabled = false;
      createClientBtn.textContent = 'Add client';
    }
  };

  const createBtn = document.getElementById('adminCreateEventBtn');
  if(createBtn) createBtn.onclick = async ()=>{
    const clientId = document.getElementById('adminNewEventClient').value;
    const name = document.getElementById('adminNewEventName').value.trim();
    const errEl = document.getElementById('adminCreateErr');
    errEl.style.display = 'none';
    if(!clientId || clientId === '__new__' || !name){
      errEl.textContent = 'Choose a client and enter an event name.';
      errEl.style.display = 'block';
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
    try{
      await adminCreateEvent(clientId, name);
      await loadAdminData();
    }catch(e){
      console.error('create event failed', e);
      errEl.textContent = 'Could not create event — check connection.';
      errEl.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Create event';
    }
  };
}
