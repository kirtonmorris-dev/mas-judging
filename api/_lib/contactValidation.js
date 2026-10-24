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

module.exports = { parseClientFields, parseEventContact };
