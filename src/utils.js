import { state } from './state.js';

export function uid(){ return Math.random().toString(36).slice(2,9); }

export function scoreKey(eventId, catId, contestantId, judge){ return [eventId, catId, contestantId, judge].join('|'); }

export function currentEvent(){ return state.config.events.find(e=>e.id===state.eventId) || null; }

export function currentJudgeObj(ev){ return ev ? ev.judges.find(j=>j.name===state.judge) : null; }

export function judgeCategories(ev, judgeName){
  return ev.categories.filter(c => c.contestants.some(ct => ct.assignedJudges.includes(judgeName)));
}

export function catMaxTotal(cat){ return cat.criteria.reduce((s,c)=>s+(Number(c.max)||0),0); }

export function contestantTitle(cat, ct){ return cat.entryType==='group' ? (ct.band || '(unnamed band)') : (ct.masquerader || '(unnamed)'); }

export function contestantSubtitle(cat, ct){
  if(cat.entryType==='group') return ct.portrayal ? `"${ct.portrayal}"` : '';
  const parts = [];
  if(ct.band) parts.push(ct.band);
  if(ct.portrayal) parts.push(`"${ct.portrayal}"`);
  return parts.join(' \u00b7 ');
}

export function sortContestants(cat, contestants){
  return [...contestants].sort((a,b)=>{
    const an = ((cat.entryType==='group' ? a.band : a.masquerader) || '').toLowerCase();
    const bn = ((cat.entryType==='group' ? b.band : b.masquerader) || '').toLowerCase();
    return an.localeCompare(bn);
  });
}

export function entityLabel(ev, plural){
  if(!ev) return plural ? 'Contestants' : 'Contestant';
  return plural ? (ev.contestantLabelPlural || 'Bands') : (ev.contestantLabel || 'Band');
}

export function shortJudgeLabel(name){
  const m = /^Judge\s+(\d+)$/i.exec((name||'').trim());
  return m ? ('J'+m[1]) : name;
}

export function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

export function escapeAttr(s){ return escapeHtml(s); }
