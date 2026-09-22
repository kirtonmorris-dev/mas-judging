import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

// Every session (judge or organizer) is bound to exactly one event via the
// ?event= URL param -- there is no dropdown here anymore, so there is no
// way for a judge or organizer link to browse into a different event.
// Creating new events, and seeing more than one event at a time, only
// happens in views/admin.js (reached via /app?admin=1).
export function renderEventPicker(isOrganizer){
  const cfg = state.config;
  const ev = cfg && cfg.events[0];
  if(!ev) return '';

  let html = `<div class="card"><label>Event</label><div style="font-weight:600; font-size:1.05rem;">${escapeHtml(ev.name)}</div>`;

  if(isOrganizer){
    html += `<div class="danger-zone">
        <div class="danger-zone-label">Danger zone</div>
        <button class="btn-danger-quiet" id="removeCurrentEventBtn">Remove this event</button>
      </div>`;
  }
  html += '</div>';
  return html;
}
