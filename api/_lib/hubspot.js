// Posts a saved lead to the HubSpot Forms API (unauthenticated submit
// endpoint). Prefixed "_" so Vercel does not deploy it as a route.
//
// Every field name below must exist BOTH as a contact property in the portal
// AND as a field on the form, or HubSpot answers FIELD_NOT_IN_FORM_DEFINITION.
// lifecyclestage is deliberately NOT sent: it is not a form field, and the
// form's own setting "Set lifecycle stage to: Lead" handles it.
// Env: HUBSPOT_PORTAL_ID, HUBSPOT_FORM_GUID. Set HUBSPOT_SEND_CONSENT=1 only
// if the form's GDPR setting requires legalConsentOptions.
const LEAD_SOURCE = 'judgedshow.com';
const PAGE_NAME = 'Judge D Show';

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  const firstname = parts.shift() || '';
  return { firstname, lastname: parts.join(' ') };
}

// `lead` is a row shaped like the leads table (snake_case).
function buildFields(lead) {
  const { firstname, lastname } = splitName(lead.name);
  const eventDateMs = lead.event_date ? Date.parse(String(lead.event_date).slice(0, 10) + 'T00:00:00Z') : null;
  const raw = {
    firstname,
    lastname,
    email: lead.email,
    company: lead.organization,
    phone: lead.phone,
    competition_type: lead.competition_type,
    event_date: eventDateMs,
    judges_range: lead.judges_range,
    contestants_range: lead.contestants_range,
    heard_about_or_message: lead.heard_about_or_message,
    lead_source_site: LEAD_SOURCE,
  };
  return Object.entries(raw)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([name, value]) => ({ objectTypeId: '0-1', name, value: String(value) }));
}

// Returns { ok, status, error }. Never throws for HubSpot-side failures.
async function submitLeadToHubSpot(lead, ipAddress) {
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const formGuid = process.env.HUBSPOT_FORM_GUID;
  if (!portalId || !formGuid) return { ok: false, status: 0, error: 'hubspot_not_configured' };
  const payload = {
    submittedAt: String(Date.now()),
    fields: buildFields(lead),
    context: {
      pageUri: lead.page_uri || 'https://judgedshow.com/',
      pageName: PAGE_NAME,
      ...(ipAddress ? { ipAddress } : {}),
    },
  };
  if (process.env.HUBSPOT_SEND_CONSENT === '1') {
    payload.legalConsentOptions = {
      consent: {
        consentToProcess: true,
        text: 'By continuing, you agree to be contacted about Judge D Show.',
      },
    };
  }
  try {
    const res = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${encodeURIComponent(portalId)}/${encodeURIComponent(formGuid)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e).slice(0, 500) };
  }
}

module.exports = { submitLeadToHubSpot, buildFields };
