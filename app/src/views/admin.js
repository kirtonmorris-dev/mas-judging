// Admin view -- reached ONLY via /app?admin=1, gated by its own PIN
// (ADMIN_PIN, separate from each event's own organizer_pin). This is the
// one place in the app allowed to see every client and every event side by
// side, and the only place that can mint a new event or reset an event's
// organizer PIN. It never shares a query with the judge or organizer views
// (see api.js's adminListEvents/adminListClients/adminCreateEvent, all
// separate RPCs from the event-scoped ones those views use) -- so there is
// no flag anywhere that widens a normal session's access into this one.
import { adminCreateClient, adminCreateEvent, adminDeleteClient, adminListClients, adminListEvents, adminLogin, adminResetOrganizerPin, adminUnlockPins, adminUpdateClient, adminUpdateEventContact, deleteEventOwn } from '../api.js';
import { render } from '../main.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';
import { escapeAttr, escapeHtml, isValidEmail, isValidPhone } from '../utils.js';

function linkFor(ev, mode){
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('event', ev.slug || ev.id);
  if(mode === 'organizer') url.searchParams.set('mode', 'organizer');
  return url.toString();
}

function slugify(name){
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const CONTACT_ERRORS = {
  name_required: 'Enter a client name.',
  contact_name_required: 'Enter a contact name.',
  contact_email_required: 'Enter a contact email.',
  contact_email_invalid: 'That contact email doesn\u2019t look right.',
  contact_phone_required: 'Enter a contact phone number.',
  contact_phone_invalid: 'That phone number doesn\u2019t look right. Use a 10-digit US number.',
  event_contact_email_invalid: 'That event-day contact email doesn\u2019t look right.'
};

// Same rules as api/_lib/contactValidation.js; returns an error code or ''.
function clientFieldError(f){
  if(!f.name) return 'name_required';
  if(!f.contactName) return 'contact_name_required';
  if(!f.contactEmail) return 'contact_email_required';
  if(!isValidEmail(f.contactEmail)) return 'contact_email_invalid';
  if(!f.contactPhone) return 'contact_phone_required';
  if(!isValidPhone(f.contactPhone)) return 'contact_phone_invalid';
  return '';
}

function contactLine(parts){
  return parts.filter(Boolean).map(escapeHtml).join(' &middot; ');
}

export function renderAdminGate(){
  return `<div class="pin-wrap">
    <div class="section-title" style="color:var(--ink);">Admin access</div>
    <input type="text" id="adminPinInput" placeholder="Admin PIN" inputmode="numeric" style="max-width:180px; margin:0 auto 12px;">
    <br><button class="btn btn-primary" id="adminPinSubmit" style="max-width:180px;">Unlock</button>
    <div id="adminPinErr" class="err" style="display:none; max-width:260px; margin:14px auto 0;">Incorrect PIN.</div>
  </div>`;
}

// The PIN is checked server-side now (api/admin/auth.js, against the
// ADMIN_PIN Vercel env var) -- this just relays the entered PIN and stores
// the short-lived token it gets back. See api.js's adminLogin.
export function attachAdminGateHandlers(){
  const submitBtn = document.getElementById('adminPinSubmit');
  submitBtn.onclick = async ()=>{
    const val = document.getElementById('adminPinInput').value.trim();
    const errEl = document.getElementById('adminPinErr');
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking…';
    try{
      const token = await adminLogin(val);
      if(token){
        state.adminToken = token;
        state.adminUnlocked = true;
        render();
      } else {
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Unlock';
      }
    }catch(e){
      console.error('admin login failed', e);
      errEl.textContent = 'Could not reach the server — check connection.';
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock';
    }
  };
}

// Any admin call gets here on a 401 (token expired or was never valid) --
// drop back to the PIN gate rather than leaving the UI in a broken state.
function handleAdminAuthError(e){
  if(e && e.code === 'admin_unauthorized'){
    state.adminUnlocked = false;
    state.adminToken = null;
    state.adminClients = null;
    state.adminEvents = null;
    showToast('Admin session expired — enter the PIN again', true);
    render();
    return true;
  }
  return false;
}

export function renderAdmin(){
  if(state.adminClients === null || state.adminEvents === null){
    return '<div class="empty">Loading clients and events&hellip;</div>';
  }

  let html = '<div class="card"><div class="section-title" style="color:var(--ink);">Clients &amp; events</div>';
  if(!state.adminClients.length){
    html += '<div class="empty">No clients yet.</div>';
  } else {
    const eventsByClientId = {};
    state.adminEvents.forEach(ev=>{
      (eventsByClientId[ev.clientId] = eventsByClientId[ev.clientId] || []).push(ev);
    });
    [...state.adminClients].sort((a,b)=>a.name.localeCompare(b.name)).forEach(client=>{
      const events = eventsByClientId[client.id] || [];
      html += `<div style="margin-top:14px; display:flex; align-items:center; gap:8px;">
        <b>${escapeHtml(client.name)}</b>
        <button class="btn btn-outline btn-small" data-edit-client="${escapeAttr(client.id)}" style="font-size:0.72rem; padding:4px 10px;">Edit client</button>
        <button class="btn-danger-quiet" data-remove-client="${escapeAttr(client.id)}" style="font-size:0.72rem;">Remove client</button>
      </div>
      <div class="info" style="margin-top:2px;"><span style="color:var(--ink-soft); font-size:0.8rem;" data-client-contact-for="${escapeAttr(client.id)}">${
        contactLine([client.contactName, client.contactEmail, client.contactPhone]) || 'No contact on file'
      }</span></div>
      <div data-edit-client-form="${escapeAttr(client.id)}" style="display:none; margin-top:8px;">
        <label>Client name</label>
        <input type="text" data-f="name" value="${escapeAttr(client.name)}">
        <label style="margin-top:8px;">Contact name</label>
        <input type="text" data-f="contactName" value="${escapeAttr(client.contactName || '')}">
        <label style="margin-top:8px;">Contact email</label>
        <input type="email" data-f="contactEmail" value="${escapeAttr(client.contactEmail || '')}">
        <label style="margin-top:8px;">Contact phone</label>
        <input type="tel" data-f="contactPhone" value="${escapeAttr(client.contactPhone || '')}">
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button class="btn btn-primary btn-small" data-save-client="${escapeAttr(client.id)}">Save</button>
          <button class="btn btn-outline btn-small" data-cancel-client="${escapeAttr(client.id)}">Cancel</button>
        </div>
        <div class="err" data-edit-client-err="${escapeAttr(client.id)}" style="display:none; margin-top:8px;"></div>
      </div>`;
      if(!events.length){
        html += '<div class="empty" style="margin-top:4px;">No events yet.</div>';
      }
      events.forEach(ev=>{
        html += `<div class="contestant-item" style="cursor:default;">
          <div class="info"><b>${escapeHtml(ev.name)}</b><span>${ev.slug ? escapeHtml(ev.slug) : '(no slug set)'} &middot; ${ev.active ? 'active' : 'inactive'} &middot; Organizer PIN: <b data-organizer-pin-for="${escapeAttr(ev.id)}">${escapeHtml(ev.organizerPin || '?')}</b></span>${
            (ev.lockedTargets && ev.lockedTargets.length)
              ? `<span data-lock-indicator-for="${escapeAttr(ev.id)}" style="color:var(--danger); font-weight:600;">Locked out: ${ev.lockedTargets.map(t=>escapeHtml(t === 'organizer' ? 'Organizer' : t.replace(/^judge:/, ''))).join(', ')}</span>` : ''
          }${
            (ev.eventContactName || ev.eventContactEmail || ev.eventContactPhone)
              ? `<span>Event-day contact: ${contactLine([ev.eventContactName, ev.eventContactEmail, ev.eventContactPhone])}</span>` : ''
          }</div>
          <span style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-small" data-copy-link="${escapeAttr(linkFor(ev,'judge'))}">Judge link</button>
            <button class="btn btn-outline btn-small" data-copy-link="${escapeAttr(linkFor(ev,'organizer'))}">Organizer link</button>
            <button class="btn btn-outline btn-small" data-edit-event="${escapeAttr(ev.id)}">Edit event</button>
            <button class="btn btn-outline btn-small" data-reset-organizer-pin="${escapeAttr(ev.id)}" data-event-name="${escapeAttr(ev.name)}">Reset PIN</button>
            <button class="btn btn-outline btn-small" data-unlock-pins="${escapeAttr(ev.id)}" data-event-name="${escapeAttr(ev.name)}">Unlock</button>
            <button class="btn-danger-quiet" data-remove-event="${escapeAttr(ev.id)}" data-event-name="${escapeAttr(ev.name)}">Remove</button>
          </span>
        </div>
        <div data-edit-event-form="${escapeAttr(ev.id)}" style="display:none; margin:0 0 10px;">
          <label>Event-day contact name (optional)</label>
          <input type="text" data-f="eventContactName" value="${escapeAttr(ev.eventContactName || '')}">
          <label style="margin-top:8px;">Event-day contact email (optional)</label>
          <input type="email" data-f="eventContactEmail" value="${escapeAttr(ev.eventContactEmail || '')}">
          <label style="margin-top:8px;">Event-day contact phone (optional)</label>
          <input type="tel" data-f="eventContactPhone" value="${escapeAttr(ev.eventContactPhone || '')}">
          <div style="margin-top:8px; display:flex; gap:6px;">
            <button class="btn btn-primary btn-small" data-save-event="${escapeAttr(ev.id)}">Save</button>
            <button class="btn btn-outline btn-small" data-cancel-event="${escapeAttr(ev.id)}">Cancel</button>
          </div>
          <div class="err" data-edit-event-err="${escapeAttr(ev.id)}" style="display:none; margin-top:8px;"></div>
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
    <div id="adminNewClientFields" style="display:none; margin-top:8px;">
      <input type="text" id="adminNewClientName" placeholder="New client name">
      <input type="text" id="adminNewClientContactName" placeholder="Contact name" style="margin-top:8px;">
      <input type="email" id="adminNewClientContactEmail" placeholder="Contact email" style="margin-top:8px;">
      <input type="tel" id="adminNewClientContactPhone" placeholder="Contact phone" style="margin-top:8px;">
      <button class="btn btn-outline btn-small" id="adminCreateClientBtn" style="margin-top:8px;">Add client</button>
    </div>
    <label style="margin-top:10px;">Event name</label>
    <input type="text" id="adminNewEventName" placeholder="e.g. WIADCA — J'ouvert 2027">
    <label style="margin-top:10px;">Link slug (memorable, goes in the URL)</label>
    <input type="text" id="adminNewEventSlug" placeholder="e.g. wiadca-jouvert-2027">
    <label style="margin-top:10px;">Event-day contact name (optional)</label>
    <input type="text" id="adminNewEventContactName">
    <label style="margin-top:10px;">Event-day contact email (optional)</label>
    <input type="email" id="adminNewEventContactEmail">
    <label style="margin-top:10px;">Event-day contact phone (optional)</label>
    <input type="tel" id="adminNewEventContactPhone">
    <button class="btn btn-primary btn-small" id="adminCreateEventBtn" style="margin-top:10px;">Create event</button>
    <div id="adminCreateErr" class="err" style="display:none; margin-top:10px;"></div>
  </div>`;

  return html;
}

export async function loadAdminData(){
  try{
    const [clients, events] = await Promise.all([adminListClients(state.adminToken), adminListEvents(state.adminToken)]);
    state.adminClients = clients;
    state.adminEvents = events;
  }catch(e){
    if(handleAdminAuthError(e)) return;
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
    document.getElementById('adminNewClientFields').style.display = isNew ? 'block' : 'none';
    if(isNew) document.getElementById('adminNewClientName').focus();
  };

  const createClientBtn = document.getElementById('adminCreateClientBtn');
  if(createClientBtn) createClientBtn.onclick = async ()=>{
    const nameInput = document.getElementById('adminNewClientName');
    const contactIds = ['adminNewClientContactName', 'adminNewClientContactEmail', 'adminNewClientContactPhone'];
    const fields = {
      name: nameInput.value.trim(),
      contactName: document.getElementById(contactIds[0]).value.trim(),
      contactEmail: document.getElementById(contactIds[1]).value.trim(),
      contactPhone: document.getElementById(contactIds[2]).value.trim()
    };
    const errEl = document.getElementById('adminCreateErr');
    errEl.style.display = 'none';
    const fieldErr = clientFieldError(fields);
    if(fieldErr){
      errEl.textContent = CONTACT_ERRORS[fieldErr];
      errEl.style.display = 'block';
      return;
    }
    createClientBtn.disabled = true;
    createClientBtn.textContent = 'Adding…';
    try{
      const newClientId = await adminCreateClient(state.adminToken, fields);
      const clients = await adminListClients(state.adminToken);
      state.adminClients = clients;
      const sel = document.getElementById('adminNewEventClient');
      sel.innerHTML = '<option value="">Select client&hellip;</option>'
        + clients.map(c=>`<option value="${c.id}" ${c.id===newClientId?'selected':''}>${escapeHtml(c.name)}</option>`).join('')
        + '<option value="__new__">+ Add new client&hellip;</option>';
      nameInput.value = '';
      contactIds.forEach(id=>{ document.getElementById(id).value = ''; });
      document.getElementById('adminNewClientFields').style.display = 'none';
      createClientBtn.disabled = false;
      createClientBtn.textContent = 'Add client';
    }catch(e){
      if(handleAdminAuthError(e)) return;
      console.error('create client failed', e);
      errEl.textContent = CONTACT_ERRORS[e && e.code] || 'Could not add client — check connection.';
      errEl.style.display = 'block';
      createClientBtn.disabled = false;
      createClientBtn.textContent = 'Add client';
    }
  };

  document.querySelectorAll('[data-remove-event]').forEach(btn=>{
    btn.onclick = async ()=>{
      const eventId = btn.getAttribute('data-remove-event');
      const eventName = btn.getAttribute('data-event-name');
      if(!confirm(`Remove "${eventName}"? This deletes its judges, categories, contestants, and scores. This cannot be undone.`)) return;
      btn.disabled = true;
      btn.textContent = 'Removing…';
      try{
        await deleteEventOwn(eventId);
        await loadAdminData();
      }catch(e){
        console.error('remove event failed', e);
        alert('Could not remove event — check connection.');
        btn.disabled = false;
        btn.textContent = 'Remove';
      }
    };
  });

  document.querySelectorAll('[data-reset-organizer-pin]').forEach(btn=>{
    btn.onclick = async ()=>{
      const eventId = btn.getAttribute('data-reset-organizer-pin');
      const eventName = btn.getAttribute('data-event-name');
      if(!confirm(`Reset the organizer PIN for "${eventName}"? The current PIN will stop working immediately -- tell the organizer the new one.`)) return;
      btn.disabled = true;
      btn.textContent = 'Resetting…';
      try{
        const { pin } = await adminResetOrganizerPin(state.adminToken, eventId);
        const ev = state.adminEvents.find(e=>e.id===eventId);
        if(ev) ev.organizerPin = pin;
        const pinEl = document.querySelector(`[data-organizer-pin-for="${eventId}"]`);
        if(pinEl) pinEl.textContent = pin;
        showToast(`New organizer PIN for "${eventName}": ${pin}`);
        btn.disabled = false;
        btn.textContent = 'Reset PIN';
        // The reset also cleared the organizer lockout server-side: drop it from the indicator.
        if(ev && ev.lockedTargets && ev.lockedTargets.includes('organizer')){
          await loadAdminData();
        }
      }catch(e){
        if(handleAdminAuthError(e)) return;
        console.error('reset organizer pin failed', e);
        alert('Could not reset PIN — check connection.');
        btn.disabled = false;
        btn.textContent = 'Reset PIN';
      }
    };
  });

  document.querySelectorAll('[data-unlock-pins]').forEach(btn=>{
    btn.onclick = async ()=>{
      const eventId = btn.getAttribute('data-unlock-pins');
      const eventName = btn.getAttribute('data-event-name');
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      try{
        await adminUnlockPins(state.adminToken, eventId);
        const ev = state.adminEvents.find(e=>e.id===eventId);
        if(ev) ev.lockedTargets = [];
        const indicator = document.querySelector(`[data-lock-indicator-for="${eventId}"]`);
        if(indicator) indicator.remove();
        showToast(`PIN lockouts cleared for "${eventName}"`);
      }catch(e){
        if(handleAdminAuthError(e)) return;
        console.error('unlock pins failed', e);
        alert('Could not unlock — check connection.');
      }
      btn.disabled = false;
      btn.textContent = 'Unlock';
    };
  });

  document.querySelectorAll('[data-remove-client]').forEach(btn=>{
    btn.onclick = async ()=>{
      const clientId = btn.getAttribute('data-remove-client');
      if(!clientId) return;
      if(!confirm('Remove this client? Only allowed if it has no events left.')) return;
      btn.disabled = true;
      btn.textContent = 'Removing…';
      try{
        await adminDeleteClient(state.adminToken, clientId);
        await loadAdminData();
      }catch(e){
        if(handleAdminAuthError(e)) return;
        console.error('remove client failed', e);
        alert(e && e.code === 'client_has_events'
          ? 'This client still has events — remove those first.'
          : 'Could not remove client — check connection.');
        btn.disabled = false;
        btn.textContent = 'Remove client';
      }
    };
  });

  const nameInput = document.getElementById('adminNewEventName');
  const slugInput = document.getElementById('adminNewEventSlug');
  let slugTouched = false;
  if(slugInput) slugInput.oninput = ()=>{ slugTouched = true; };
  if(nameInput) nameInput.oninput = ()=>{
    if(!slugTouched) slugInput.value = slugify(nameInput.value);
  };

  const createBtn = document.getElementById('adminCreateEventBtn');
  if(createBtn) createBtn.onclick = async ()=>{
    const clientId = document.getElementById('adminNewEventClient').value;
    const name = document.getElementById('adminNewEventName').value.trim();
    const slug = document.getElementById('adminNewEventSlug').value.trim();
    const contact = {
      eventContactName: document.getElementById('adminNewEventContactName').value.trim(),
      eventContactEmail: document.getElementById('adminNewEventContactEmail').value.trim(),
      eventContactPhone: document.getElementById('adminNewEventContactPhone').value.trim()
    };
    const errEl = document.getElementById('adminCreateErr');
    errEl.style.display = 'none';
    if(!clientId || clientId === '__new__' || !name){
      errEl.textContent = 'Choose a client and enter an event name.';
      errEl.style.display = 'block';
      return;
    }
    if(contact.eventContactEmail && !isValidEmail(contact.eventContactEmail)){
      errEl.textContent = CONTACT_ERRORS.event_contact_email_invalid;
      errEl.style.display = 'block';
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
    try{
      await adminCreateEvent(state.adminToken, clientId, name, slug, contact);
      await loadAdminData();
    }catch(e){
      if(handleAdminAuthError(e)) return;
      console.error('create event failed', e);
      errEl.textContent = e && e.code === 'slug_taken'
        ? 'That link slug is already used by another event — pick a different one.'
        : (CONTACT_ERRORS[e && e.code] || 'Could not create event — check connection.');
      errEl.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Create event';
    }
  };

  const q = (attr, id)=>document.querySelector(`[${attr}="${CSS.escape(id)}"]`);
  const readFields = (form)=>{
    const out = {};
    form.querySelectorAll('[data-f]').forEach(inp=>{ out[inp.getAttribute('data-f')] = inp.value.trim(); });
    return out;
  };

  document.querySelectorAll('[data-edit-client]').forEach(btn=>{
    btn.onclick = ()=>{
      const form = q('data-edit-client-form', btn.getAttribute('data-edit-client'));
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };
  });
  document.querySelectorAll('[data-cancel-client]').forEach(btn=>{
    btn.onclick = ()=>{
      const form = q('data-edit-client-form', btn.getAttribute('data-cancel-client'));
      form.querySelectorAll('[data-f]').forEach(inp=>{ inp.value = inp.defaultValue; });
      form.style.display = 'none';
    };
  });
  document.querySelectorAll('[data-save-client]').forEach(btn=>{
    btn.onclick = async ()=>{
      const clientId = btn.getAttribute('data-save-client');
      const form = q('data-edit-client-form', clientId);
      const errEl = q('data-edit-client-err', clientId);
      const fields = readFields(form);
      errEl.style.display = 'none';
      const fieldErr = clientFieldError(fields);
      if(fieldErr){
        errEl.textContent = CONTACT_ERRORS[fieldErr];
        errEl.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try{
        await adminUpdateClient(state.adminToken, clientId, fields);
        await loadAdminData();
      }catch(e){
        if(handleAdminAuthError(e)) return;
        console.error('update client failed', e);
        errEl.textContent = CONTACT_ERRORS[e && e.code] || 'Could not save client — check connection.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    };
  });

  document.querySelectorAll('[data-edit-event]').forEach(btn=>{
    btn.onclick = ()=>{
      const form = q('data-edit-event-form', btn.getAttribute('data-edit-event'));
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };
  });
  document.querySelectorAll('[data-cancel-event]').forEach(btn=>{
    btn.onclick = ()=>{
      const form = q('data-edit-event-form', btn.getAttribute('data-cancel-event'));
      form.querySelectorAll('[data-f]').forEach(inp=>{ inp.value = inp.defaultValue; });
      form.style.display = 'none';
    };
  });
  document.querySelectorAll('[data-save-event]').forEach(btn=>{
    btn.onclick = async ()=>{
      const eventId = btn.getAttribute('data-save-event');
      const form = q('data-edit-event-form', eventId);
      const errEl = q('data-edit-event-err', eventId);
      const contact = readFields(form);
      errEl.style.display = 'none';
      if(contact.eventContactEmail && !isValidEmail(contact.eventContactEmail)){
        errEl.textContent = CONTACT_ERRORS.event_contact_email_invalid;
        errEl.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try{
        await adminUpdateEventContact(state.adminToken, eventId, contact);
        await loadAdminData();
      }catch(e){
        if(handleAdminAuthError(e)) return;
        console.error('update event contact failed', e);
        errEl.textContent = CONTACT_ERRORS[e && e.code] || 'Could not save event contact — check connection.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    };
  });
}
