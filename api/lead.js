// GET  /api/lead -> { token }   fill-time token, fetched when the modal opens
// POST /api/lead -- marketing-site lead form.
// (One function for both: the Vercel Hobby plan caps a deployment at 12
// serverless functions and api/admin/ already uses 11.)
// Order: honeypot -> unknown fields -> validation -> token/fill-time -> rate
// limit -> save to Supabase -> send to HubSpot -> record the HubSpot result.
// A lead that was saved always gets a success response, even if HubSpot failed
// (scripts/resend-failed-leads.mjs recovers those).
//
// Honeypot and fast/bad-token hits get a normal-looking success and are stored
// with a spam status; they are never sent to HubSpot.
const crypto = require('crypto');
const { parseLead, unknownLeadFields, LEAD_MAX } = require('./_lib/contactValidation');
const { checkToken, issueToken } = require('./_lib/leadToken');
const { insertLead, updateLead, countAccepted } = require('./_lib/leadStore');
const { submitLeadToHubSpot } = require('./_lib/hubspot');

const HOURLY_LIMIT = 5;
const DAILY_LIMIT = 15;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const first = typeof xff === 'string' ? xff.split(',')[0].trim() : '';
  return first || (req.socket && req.socket.remoteAddress) || '';
}

function hashIp(ip) {
  const salt = process.env.LEAD_IP_SALT;
  if (!salt) throw new Error('LEAD_IP_SALT is not set');
  return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex');
}

function clip(v, n) {
  return typeof v === 'string' ? v.trim().slice(0, n) || null : null;
}

// Row for a spam hit: keep what we can, never trust it.
function spamRow(body, status, detail, ipHash, ua) {
  return {
    name: clip(body.name, LEAD_MAX.name),
    email: clip(body.email, LEAD_MAX.email),
    organization: clip(body.organization, LEAD_MAX.organization),
    status,
    status_detail: detail,
    hubspot_status: 'pending',
    page_uri: clip(body.pageUri, LEAD_MAX.pageUri),
    ip_hash: ipHash,
    user_agent: ua,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ token: issueToken() });
    } catch (e) {
      console.error('lead-token failed', e.message);
      res.status(500).json({ error: 'server_error' });
    }
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const ua = clip(req.headers['user-agent'], 400);
  const ip = clientIp(req);

  try {
    const ipHash = hashIp(ip);

    // 1. Honeypot. Checked first so a bot that fills it learns nothing from
    //    a validation error.
    if (typeof body.company_website === 'string' && body.company_website.trim() !== '') {
      const row = spamRow(body, 'spam_honeypot', 'honeypot_filled', ipHash, ua);
      await insertLead(row);
      res.status(200).json({ ok: true });
      return;
    }

    // 2. Shape and validation: unknown fields, then each field.
    const unknown = unknownLeadFields(body);
    if (unknown.length) {
      res.status(400).json({ error: 'unknown_field', message: 'Something went wrong with the form. Please refresh and try again.' });
      return;
    }
    const parsed = parseLead(body);
    if (parsed.errors) {
      res.status(400).json({ error: 'validation', fields: parsed.errors });
      return;
    }
    const v = parsed.values;

    // 3. Fill-time token. Expired tokens are an honest "reopen the form"
    //    (a real visitor can leave a tab open); the rest look like success.
    const tok = checkToken(body.token);
    if (!tok.ok) {
      if (tok.reason === 'expired') {
        res.status(400).json({ error: 'token_expired', message: 'This form was open too long. Please try again.' });
        return;
      }
      const row = spamRow(body, 'spam_too_fast', `token_${tok.reason}`, ipHash, ua);
      await insertLead(row);
      res.status(200).json({ ok: true });
      return;
    }

    // 4. Rate limit by hashed IP, counted from accepted rows in the table.
    const now = Date.now();
    const [lastHour, lastDay] = await Promise.all([
      countAccepted(ipHash, new Date(now - 60 * 60 * 1000).toISOString()),
      countAccepted(ipHash, new Date(now - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    if (lastHour >= HOURLY_LIMIT || lastDay >= DAILY_LIMIT) {
      const row = spamRow(body, 'rate_limited', lastHour >= HOURLY_LIMIT ? 'hourly_cap' : 'daily_cap', ipHash, ua);
      await insertLead(row);
      res.status(429).json({ error: 'rate_limited', message: 'We\'ve received a few requests from your connection already. Please try again later, or book a time directly.' });
      return;
    }

    // 5. Save, then HubSpot, then record the HubSpot result.
    const saved = await insertLead({
      name: v.name,
      email: v.email,
      organization: v.organization,
      phone: v.phone,
      competition_type: v.competitionType,
      event_date: v.eventDate,
      event_date_unsure: v.eventDateUnsure,
      judges_range: v.judgesRange,
      contestants_range: v.contestantsRange,
      heard_about_or_message: v.message,
      page_uri: v.pageUri,
      utm_source: v.utmSource,
      utm_medium: v.utmMedium,
      utm_campaign: v.utmCampaign,
      utm_term: v.utmTerm,
      utm_content: v.utmContent,
      status: 'accepted',
      hubspot_status: 'pending',
      ip_hash: ipHash,
      user_agent: ua,
    });

    try {
      const hs = await submitLeadToHubSpot(saved, ip);
      await updateLead(saved.id, {
        hubspot_status: hs.ok ? 'sent' : 'failed',
        hubspot_http_status: hs.status || null,
        hubspot_error: hs.ok ? null : hs.error || null,
      });
      if (!hs.ok) console.error('lead: hubspot rejected', saved.id, hs.status, hs.error);
    } catch (e) {
      // Saved, but we couldn't record the HubSpot result. Row stays 'pending'
      // and the resend script picks it up.
      console.error('lead: hubspot step failed', saved.id, e.message);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
};
