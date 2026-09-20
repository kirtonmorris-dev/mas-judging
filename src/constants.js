export const SUPABASE_URL = 'https://pjqojhtqxljnukwlzekr.supabase.co';

export const SUPABASE_KEY = 'sb_publishable_ahi2YrsAURh98_DGfM1Hfw_sRw9T34B';

export const TABLE = 'mas_judging_data';

export const CRITERIA_TEMPLATE = [
  {key:'presentation', label:'Presentation / Color', max:20},
  {key:'craftsmanship', label:'Craftsmanship / Design', max:30},
  {key:'creativity', label:'Creativity / Authenticity', max:30},
  {key:'impact', label:'Visual Impact / Portability', max:20},
];

export const ORG_PIN = '2026';

export function cloneTemplate(){ return CRITERIA_TEMPLATE.map(c=>({...c})); }

export const DEFAULT_CONFIG = {
  events: [
    {
      id: 'baltimore-one-carnival',
      name: 'Baltimore One Carnival',
      judges: ['Judge 1','Judge 2','Judge 3'],
      categories: [
        {
          id: 'adult-female-individual',
          name: 'Adult Female Individual',
          entryType: 'individual',
          criteria: cloneTemplate(),
          contestants: [
            {id:'c1', band:'East Coast Limers', masquerader:'Alana Dopson', portrayal:'Pink - The Love Illusion', assignedJudges:['Judge 1','Judge 2','Judge 3']},
            {id:'c2', band:'East Coast Limers', masquerader:'Selah Thom', portrayal:'The Sand Dancer', assignedJudges:['Judge 1','Judge 2','Judge 3']},
            {id:'c3', band:'Jackie and Associates', masquerader:'Pearl Wallace', portrayal:'The Song of Rapso', assignedJudges:['Judge 1','Judge 2','Judge 3']},
            {id:'c4', band:'Dreamerz Carnival', masquerader:'Kierra Charles', portrayal:'Portrayal of Fer-de-lance', assignedJudges:['Judge 1','Judge 2','Judge 3']},
            {id:'c5', band:'Dreamerz Carnival', masquerader:'Maryze Williams', portrayal:'Portrayal of Scarlet Macaw', assignedJudges:['Judge 1','Judge 2','Judge 3']},
          ]
        }
      ]
    },
    { id: 'ny-kiddies-carnival', name: 'NY Carnival — Kiddies (Saturday)', judges: [], categories: [] },
    { id: 'ny-adult-carnival', name: 'NY Carnival — Adult (Monday)', judges: [], categories: [] },
  ]
};

// Defaults chosen so an event/category saved before the competition
// taxonomy existed renders and behaves exactly as it did before: the
// default contestant label and field labels match the strings that used
// to be hardcoded everywhere ("Band"/"Masquerader"/"Portrayal"), stages
// and extraFields default to empty (today's exact behavior), and
// competitionFamily defaults to 'mas' since that's what every existing
// event already is.
export function normalizeConfig(cfg){
  if(cfg._rev === undefined) cfg._rev = 0;
  (cfg.events||[]).forEach(ev=>{
    ev.judges = (ev.judges||[]).map(j => typeof j === 'string' ? {name:j, realName:j, pin:null} : j);
    ev.judges.forEach(j=>{ if(typeof j.realName !== 'string' || !j.realName) j.realName = j.name; });
    // undefined = legacy data that predates this field -> default to 'mas'.
    // null = organizer explicitly chose "Custom / Unassigned" -> keep it.
    if(ev.competitionFamily === undefined) ev.competitionFamily = 'mas';
    if(ev.competitionType === undefined) ev.competitionType = null;
    if(!ev.scope) ev.scope = 'community';
    if(ev.active === undefined) ev.active = true;
    if(!ev.contestantLabel) ev.contestantLabel = 'Band';
    if(!ev.contestantLabelPlural) ev.contestantLabelPlural = 'Bands';
    if(!ev.fieldLabels || typeof ev.fieldLabels !== 'object') ev.fieldLabels = {};
    if(!ev.fieldLabels.primary) ev.fieldLabels.primary = 'Band';
    if(!ev.fieldLabels.secondary) ev.fieldLabels.secondary = 'Masquerader';
    if(!ev.fieldLabels.detail) ev.fieldLabels.detail = 'Portrayal';
    (ev.categories||[]).forEach(cat=>{
      if(cat.entryType !== 'individual' && cat.entryType !== 'group') cat.entryType = 'individual';
      if(!Array.isArray(cat.criteria) || cat.criteria.length===0) cat.criteria = cloneTemplate();
      if(!Array.isArray(cat.stages)) cat.stages = [];
      if(!Array.isArray(cat.extraFields)) cat.extraFields = [];
      (cat.contestants||[]).forEach(ct=>{
        if(!Array.isArray(ct.assignedJudges)) ct.assignedJudges = [];
        if(typeof ct.masquerader !== 'string') ct.masquerader = '';
        if(!ct.extra || typeof ct.extra !== 'object') ct.extra = {};
      });
    });
  });
  return cfg;
}
