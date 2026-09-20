/* Competition Library — a catalog of competition families and named
   competition templates for Trinidad & Tobago Carnival (and, generically,
   any Carnival organization). This file is pure reference data: nothing
   here is an actual event/competition instance, and nothing here is
   fabricated scoring criteria. Templates only carry defaultCriteria where
   the existing application already defines them (Mas); every other
   template leaves criteria for the organizer to define, same as today's
   category setup already requires. */

import { CRITERIA_TEMPLATE } from './constants.js';

export const COMPETITION_FAMILIES = [
  { id:'mas', name:'Mas', contestantLabel:'Band', contestantLabelPlural:'Bands',
    description:'Costume, King & Queen, and individual mas competitions.' },
  { id:'panorama', name:'Panorama', contestantLabel:'Band', contestantLabelPlural:'Bands',
    description:'Steelband / steel orchestra competitions.' },
  { id:'calypso', name:'Calypso', contestantLabel:'Performer', contestantLabelPlural:'Performers',
    description:'Calypso monarch, extempo, and commentary competitions.' },
  { id:'soca', name:'Soca', contestantLabel:'Performer', contestantLabelPlural:'Performers',
    description:'Soca monarch and related competitions.' },
  { id:'chutney', name:'Chutney Soca', contestantLabel:'Performer', contestantLabelPlural:'Performers',
    description:'Chutney and chutney soca monarch competitions.' },
  { id:'jouvert', name:"J'ouvert", contestantLabel:'Band', contestantLabelPlural:'Bands',
    description:"J'ouvert band and bomb competitions." },
  { id:'traditional', name:'Traditional Mas', contestantLabel:'Portrayal', contestantLabelPlural:'Portrayals',
    description:'Traditional Carnival characters. The organizer configures whether a given competition treats these as individuals, groups, bands, or categories.' },
  { id:'stickfighting', name:'Stick Fighting', contestantLabel:'Competitor', contestantLabelPlural:'Competitors',
    description:'Kalinda / stick fighting competitions, often held in stages.' },
  { id:'limbo', name:'Limbo', contestantLabel:'Competitor', contestantLabelPlural:'Competitors',
    description:'Limbo competitions.' },
  { id:'schools', name:'Schools Carnival', contestantLabel:'Group', contestantLabelPlural:'Groups',
    description:'School-based Carnival competitions across panorama, soca, chutney, tassa, and mas.' },
  { id:'kiddies', name:'Kiddies Carnival', contestantLabel:'Band', contestantLabelPlural:'Bands',
    description:"Children's Carnival competitions." },
];

export function getFamily(familyId){
  return COMPETITION_FAMILIES.find(f=>f.id===familyId) || null;
}

// entryTypeDefault mirrors the app's existing category.entryType values
// ('individual' | 'group') so a template maps directly onto today's model.
// defaultCriteria is left null unless the existing application already
// defines those criteria elsewhere (only true for the two Mas cases below).
export const COMPETITION_TEMPLATES = [
  // ---------------- Mas ----------------
  { id:'mas-senior-king', familyId:'mas', name:'Senior King of Carnival', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-senior-queen', familyId:'mas', name:'Senior Queen of Carnival', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-junior-king', familyId:'mas', name:'Junior King of Carnival', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-junior-queen', familyId:'mas', name:'Junior Queen of Carnival', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-king-of-bands', familyId:'mas', name:'King of the Bands', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-queen-of-bands', familyId:'mas', name:'Queen of the Bands', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-band-of-year', familyId:'mas', name:'Band of the Year', entryTypeDefault:'group', defaultCriteria: null },
  { id:'mas-junior-band-of-year', familyId:'mas', name:'Junior Band of the Year', entryTypeDefault:'group', defaultCriteria: null },
  { id:'mas-senior-traditional-individuals', familyId:'mas', name:'Senior Traditional Individuals', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'mas-junior-traditional-individuals', familyId:'mas', name:'Junior Traditional Individuals', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'mas-senior-conventional-individuals', familyId:'mas', name:'Senior Conventional Individuals', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-junior-individual', familyId:'mas', name:'Junior Individual Competitions', entryTypeDefault:'individual', defaultCriteria: CRITERIA_TEMPLATE },
  { id:'mas-kiddies-costume', familyId:'mas', name:'Kiddies Carnival Costume Competition', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'mas-kiddies-band-of-year', familyId:'mas', name:'Kiddies Band of the Year', entryTypeDefault:'group', defaultCriteria: null },

  // ---------------- Panorama ----------------
  { id:'pan-single-pan', familyId:'panorama', name:'National Single Pan', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-small-conventional', familyId:'panorama', name:'National Small Conventional Bands', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-medium-conventional', familyId:'panorama', name:'National Medium Conventional Bands', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-large-conventional', familyId:'panorama', name:'National Large Conventional Bands', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-junior-21-under', familyId:'panorama', name:'National Junior Panorama 21 & Under', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-junior-19-under', familyId:'panorama', name:'National Junior Panorama 19 & Under', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-junior-primary', familyId:'panorama', name:'National Junior Panorama Primary Schools', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-junior-secondary', familyId:'panorama', name:'National Junior Panorama Secondary Schools', entryTypeDefault:'group', defaultCriteria: null },
  { id:'pan-tobago', familyId:'panorama', name:'Tobago Panorama', entryTypeDefault:'group', defaultCriteria: null },

  // ---------------- Calypso ----------------
  { id:'calypso-national-monarch', familyId:'calypso', name:'National Calypso Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-national-junior-monarch', familyId:'calypso', name:'National Junior Calypso Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-young-kings', familyId:'calypso', name:'Young Kings', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-queen', familyId:'calypso', name:'Calypso Queen', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-extempo', familyId:'calypso', name:'Extempo', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-freestyle', familyId:'calypso', name:'Freestyle', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-social-commentary', familyId:'calypso', name:'Social Commentary', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-political-commentary', familyId:'calypso', name:'Political Commentary', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'calypso-regional-community', familyId:'calypso', name:'Regional / Community Calypso Competition', entryTypeDefault:'individual', defaultCriteria: null },

  // ---------------- Soca ----------------
  { id:'soca-international-monarch', familyId:'soca', name:'International Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'soca-groovy-monarch', familyId:'soca', name:'Groovy Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'soca-power-monarch', familyId:'soca', name:'Power Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'soca-junior-monarch', familyId:'soca', name:'Junior Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'soca-youth', familyId:'soca', name:'Youth Soca Competition', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'soca-regional-community', familyId:'soca', name:'Regional / Community Soca Competition', entryTypeDefault:'individual', defaultCriteria: null },

  // ---------------- Chutney Soca ----------------
  { id:'chutney-monarch', familyId:'chutney', name:'Chutney Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'chutney-international-monarch', familyId:'chutney', name:'International Chutney Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'chutney-queen', familyId:'chutney', name:'Chutney Soca Queen', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'chutney-traditional-monarch', familyId:'chutney', name:'Traditional Chutney Monarch', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'chutney-junior-youth', familyId:'chutney', name:'Junior / Youth Chutney Soca Competition', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'chutney-regional-community', familyId:'chutney', name:'Regional / Community Chutney Competition', entryTypeDefault:'individual', defaultCriteria: null },

  // ---------------- J'ouvert ----------------
  { id:'jouvert-band', familyId:'jouvert', name:"J'ouvert Band Competition", entryTypeDefault:'group', defaultCriteria: null },
  { id:'jouvert-bomb', familyId:'jouvert', name:"Neville Jules J'ouvert Bomb Competition", entryTypeDefault:'group', defaultCriteria: null },
  { id:'jouvert-regional-community', familyId:'jouvert', name:"Regional / Community J'ouvert Competition", entryTypeDefault:'group', defaultCriteria: null },

  // ---------------- Traditional Mas ----------------
  // entryTypeDefault is a suggestion only -- the brief is explicit that the
  // organizer decides per-competition whether a character is judged as an
  // individual, a group, a band, or a category within a larger competition.
  { id:'trad-midnight-robber', familyId:'traditional', name:'Midnight Robber', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-pierrot-grenade', familyId:'traditional', name:'Pierrot Grenade', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-dame-lorraine', familyId:'traditional', name:'Dame Lorraine', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-dragon', familyId:'traditional', name:'Dragon', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-blue-devil', familyId:'traditional', name:'Blue Devil', entryTypeDefault:'group', defaultCriteria: null },
  { id:'trad-bookman', familyId:'traditional', name:'Bookman', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-moko-jumbie', familyId:'traditional', name:'Moko Jumbie', entryTypeDefault:'group', defaultCriteria: null },
  { id:'trad-baby-doll', familyId:'traditional', name:'Baby Doll', entryTypeDefault:'individual', defaultCriteria: null },
  { id:'trad-fancy-indians', familyId:'traditional', name:'Fancy Indians', entryTypeDefault:'group', defaultCriteria: null },
  { id:'trad-other', familyId:'traditional', name:'Other Traditional Characters', entryTypeDefault:'individual', defaultCriteria: null },

  // ---------------- Stick Fighting ----------------
  { id:'stick-regional-prelim', familyId:'stickfighting', name:'Regional Stick Fighting Preliminary', entryTypeDefault:'individual', defaultCriteria: null, supportsStages:true },
  { id:'stick-regional-semifinal', familyId:'stickfighting', name:'Regional Stick Fighting Semifinal', entryTypeDefault:'individual', defaultCriteria: null, supportsStages:true },
  { id:'stick-national-final', familyId:'stickfighting', name:'National Stick Fighting Final', entryTypeDefault:'individual', defaultCriteria: null, supportsStages:true },

  // ---------------- Limbo ----------------
  { id:'limbo-national', familyId:'limbo', name:'National Limbo Competition', entryTypeDefault:'individual', defaultCriteria: null, supportsStages:true },

  // ---------------- Schools Carnival ----------------
  { id:'schools-panorama-primary', familyId:'schools', name:'National Schools Panorama — Primary', entryTypeDefault:'group', defaultCriteria: null, extraFieldsDefault:['school','region'] },
  { id:'schools-panorama-secondary', familyId:'schools', name:'National Schools Panorama — Secondary', entryTypeDefault:'group', defaultCriteria: null, extraFieldsDefault:['school','region'] },
  { id:'schools-junior-soca-primary', familyId:'schools', name:'Junior Soca — Primary', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['school','ageGroup'] },
  { id:'schools-junior-soca-secondary', familyId:'schools', name:'Junior Soca — Secondary', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['school','ageGroup'] },
  { id:'schools-intellectual-chutney', familyId:'schools', name:'Intellectual Carnival Chutney Soca Monarch', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['school'] },
  { id:'schools-tassarama', familyId:'schools', name:'Schools Tassarama Competition', entryTypeDefault:'group', defaultCriteria: null, extraFieldsDefault:['school','region'] },
  { id:'schools-mas-costume', familyId:'schools', name:'Schools Mas / Costume Competition', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['school','ageGroup'] },

  // ---------------- Kiddies Carnival ----------------
  { id:'kiddies-king', familyId:'kiddies', name:'Kiddies King', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-queen', familyId:'kiddies', name:'Kiddies Queen', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-individual-costume', familyId:'kiddies', name:'Kiddies Individual Costume', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-band', familyId:'kiddies', name:'Kiddies Band Competition', entryTypeDefault:'group', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-band-of-year', familyId:'kiddies', name:'Kiddies Band of the Year', entryTypeDefault:'group', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-babies-in-arms', familyId:'kiddies', name:'Babies in Arms', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
  { id:'kiddies-age-based', familyId:'kiddies', name:'Age-based Kiddies Competition', entryTypeDefault:'individual', defaultCriteria: null, extraFieldsDefault:['ageGroup'] },
];

export function getTemplate(templateId){
  return COMPETITION_TEMPLATES.find(t=>t.id===templateId) || null;
}

export function templatesForFamily(familyId){
  return COMPETITION_TEMPLATES.filter(t=>t.familyId===familyId);
}

// Known extra-field definitions a template may reference via extraFieldsDefault.
// These back the generic per-contestant metadata mechanism (Setup renders an
// input per configured key; nothing here is enforced or required).
export const EXTRA_FIELD_DEFS = {
  school: { label:'School' },
  ageGroup: { label:'Age Group' },
  region: { label:'Region' },
};

export const SCOPE_OPTIONS = ['national','regional','community','school','organization','private'];
