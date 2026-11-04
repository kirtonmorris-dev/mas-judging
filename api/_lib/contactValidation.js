// Shared contact-field checks for the /api/admin/* routes. Prefixed "_" so
// Vercel doesn't deploy it as a route. Deliberately loose: it catches typos,
// not unusual-but-real values.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validEmail(s) {
  return EMAIL_RE.test(s);
}

// Common US formats: 4105551234, (410) 555-1234, 410-555-1234, 410.555.1234,
// +1 410 555 1234, optional "ext 12" / "x12" tail. Needs 10 digits, or 11
// starting with 1, after any extension is removed.
function validPhone(s) {
  if (!/^[\d\s().+\-]+(?:\s*(?:ext\.?|x|#)\s*\d{1,6})?$/i.test(s)) return false;
  const main = s.replace(/\s*(?:ext\.?|x|#)\s*\d{1,6}$/i, '');
  const digits = main.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}

// Required client fields (create and edit). Returns { values } or { error }.
function parseClientFields(body) {
  const name = str(body.name);
  const contactName = str(body.contactName);
  const contactEmail = str(body.contactEmail);
  const contactPhone = str(body.contactPhone);
  if (!name) return { error: 'name_required' };
  if (!contactName) return { error: 'contact_name_required' };
  if (!contactEmail) return { error: 'contact_email_required' };
  if (!validEmail(contactEmail)) return { error: 'contact_email_invalid' };
  if (!contactPhone) return { error: 'contact_phone_required' };
  if (!validPhone(contactPhone)) return { error: 'contact_phone_invalid' };
  return { values: { name, contactName, contactEmail, contactPhone } };
}

// Optional event-day contact. Empty -> null. Email checked only when present.
function parseEventContact(body) {
  const name = str(body.eventContactName) || null;
  const email = str(body.eventContactEmail) || null;
  const phone = str(body.eventContactPhone) || null;
  if (email && !validEmail(email)) return { error: 'event_contact_email_invalid' };
  return { values: { name, email, phone } };
}

// ---- Marketing-site lead form (api/lead.js) ----
// The option lists live here so the server, the HubSpot dropdown values and
// the form in index.html stay in step. HubSpot dropdown option VALUES must be
// these exact strings.
const COMPETITION_TYPES = [
  'Carnival and steelband',
  'Music and talent shows',
  'Pageants and cultural competitions',
  'School and youth competitions',
  'Pitch and business events',
  'Other',
];
const JUDGES_RANGES = ['1-3', '4-6', '7-10', '11+'];
const CONTESTANTS_RANGES = ['Under 25', '25-50', '51-100', '101-250', '250+'];

const LEAD_FIELDS = [
  'token', 'name', 'email', 'organization', 'phone', 'competitionType',
  'eventDate', 'eventDateUnsure', 'judgesRange', 'contestantsRange', 'message',
  'pageUri', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent',
  'company_website', // honeypot
];
const LEAD_MAX = {
  name: 120, email: 254, organization: 160, phone: 40, message: 2000,
  pageUri: 500, utm: 200,
};

// Returns { unknown: [fields] } for unexpected keys, so the endpoint can reject them.
function unknownLeadFields(body) {
  return Object.keys(body).filter((k) => !LEAD_FIELDS.includes(k));
}

// Returns { values } or { errors: { field: message } }. Messages are shown to
// the visitor as-is.
function parseLead(body) {
  const errors = {};
  const v = {
    name: str(body.name),
    email: str(body.email),
    organization: str(body.organization),
    phone: str(body.phone) || null,
    competitionType: str(body.competitionType) || null,
    eventDate: str(body.eventDate) || null,
    eventDateUnsure: body.eventDateUnsure === true,
    judgesRange: str(body.judgesRange) || null,
    contestantsRange: str(body.contestantsRange) || null,
    message: str(body.message) || null,
    pageUri: str(body.pageUri).slice(0, LEAD_MAX.pageUri) || null,
    utmSource: str(body.utmSource).slice(0, LEAD_MAX.utm) || null,
    utmMedium: str(body.utmMedium).slice(0, LEAD_MAX.utm) || null,
    utmCampaign: str(body.utmCampaign).slice(0, LEAD_MAX.utm) || null,
    utmTerm: str(body.utmTerm).slice(0, LEAD_MAX.utm) || null,
    utmContent: str(body.utmContent).slice(0, LEAD_MAX.utm) || null,
  };
  for (const k of ['name', 'email', 'organization', 'phone', 'message']) {
    if (body[k] != null && typeof body[k] !== 'string') errors[k] = 'Please enter text only.';
  }
  if (!v.name) errors.name = 'Please enter your name.';
  else if (v.name.length > LEAD_MAX.name) errors.name = 'Name is too long (120 characters max).';
  if (!v.email) errors.email = 'Please enter your work email.';
  else if (v.email.length > LEAD_MAX.email || !validEmail(v.email)) errors.email = 'That email address doesn\'t look right.';
  if (!v.organization) errors.organization = 'Please enter your organization.';
  else if (v.organization.length > LEAD_MAX.organization) errors.organization = 'Organization is too long (160 characters max).';
  if (v.phone && (v.phone.length > LEAD_MAX.phone || !validPhone(v.phone))) errors.phone = 'Please enter a US phone number, or leave it blank.';
  if (v.message && v.message.length > LEAD_MAX.message) errors.message = 'Message is too long (2,000 characters max).';
  if (v.competitionType && !COMPETITION_TYPES.includes(v.competitionType)) errors.competitionType = 'Please choose from the list.';
  if (v.judgesRange && !JUDGES_RANGES.includes(v.judgesRange)) errors.judgesRange = 'Please choose from the list.';
  if (v.contestantsRange && !CONTESTANTS_RANGES.includes(v.contestantsRange)) errors.contestantsRange = 'Please choose from the list.';
  if (v.eventDate) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(v.eventDate) && !Number.isNaN(Date.parse(v.eventDate + 'T00:00:00Z'));
    if (!ok) errors.eventDate = 'Please enter a valid date, or choose "Not sure yet".';
  }
  if (v.eventDateUnsure) v.eventDate = null;
  if (Object.keys(errors).length) return { errors };
  return { values: v };
}

module.exports = {
  parseClientFields, parseEventContact,
  parseLead, unknownLeadFields, LEAD_MAX,
  COMPETITION_TYPES, JUDGES_RANGES, CONTESTANTS_RANGES,
};
