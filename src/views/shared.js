import { state } from '../state.js';
import { escapeHtml } from '../utils.js';

export function renderEventPicker(isOrganizer){
  const cfg = state.config;
  if(!isOrganizer && cfg.events.length===0) return '';

  let html = '<div class="card"><label>Event</label>';
  if(cfg.events.length===0){
    html += `<input type="text" id="newEventNameInline" placeholder="New event name (e.g. NY Carnival — J'ouvert)">
      <button class="btn btn-primary btn-small" id="createEventInlineBtn">Create event</button>`;
    if(!cfg.events.find(e=>e.name==='Baltimore One Carnival 2026 (Historical)')){
      html += '<button class="btn btn-outline btn-small" id="loadBaltimoreHistBtn" style="margin-top:10px; width:100%;">Load Baltimore 2026 historical data from spreadsheet</button>';
    }
    html += '</div>';
    return html;
  }

  html += '<select id="eventSelect">';
  cfg.events.forEach(ev=>{
    html += `<option value="${ev.id}" ${state.eventId===ev.id?'selected':''}>${escapeHtml(ev.name)}</option>`;
  });
  if(isOrganizer) html += `<option value="__add__">+ Add new event&hellip;</option>`;
  html += '</select>';

  if(isOrganizer){
    html += `<input type="text" id="newEventNameInline" placeholder="New event name (e.g. NY Carnival — J'ouvert)" style="display:none; margin-top:0;">
      <button class="btn btn-primary btn-small" id="createEventInlineBtn" style="display:none; margin-top:8px;">Create event</button>`;
    html += `<button class="btn btn-danger btn-small" id="removeCurrentEventBtn" style="margin-top:10px; width:100%;">Remove this event</button>`;
    if(!cfg.events.find(e=>e.name==='Baltimore One Carnival 2026 (Historical)')){
      html += '<button class="btn btn-outline btn-small" id="loadBaltimoreHistBtn" style="margin-top:10px; width:100%;">Load Baltimore 2026 historical data from spreadsheet</button>';
    } else {
      html += '<button class="btn btn-outline btn-small" id="fixBaltimoreBtn" style="margin-top:10px; width:100%;">Apply Baltimore score corrections (Adult Female Individual + Non-Costume Band Large)</button>';
    }
    html += '<button class="btn btn-outline btn-small" id="loadWiadcaBtn" style="margin-top:10px; width:100%;">Load WIADCA Junior Carnival data into this event</button>';
  }
  html += '</div>';
  return html;
}
