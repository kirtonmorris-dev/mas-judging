// Signed fill-time tokens for the lead form. A token is "<issuedAtMs>.<hmac>".
// The browser fetches one when the modal opens (GET /api/lead) and sends
// it back with the form. The server then knows how long the form was open
// without storing anything. Prefixed "_" so Vercel does not deploy it as a route.
//
// LEAD_TOKEN_SECRET is its own secret, separate from ADMIN_TOKEN_SECRET.
const crypto = require('crypto');

const MIN_FILL_MS = 3 * 1000;          // faster than this is not a person
const MAX_AGE_MS = 60 * 60 * 1000;     // older than an hour: ask the visitor to reopen the form

function sign(payload) {
  const secret = process.env.LEAD_TOKEN_SECRET;
  if (!secret) throw new Error('LEAD_TOKEN_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function issueToken() {
  const payload = String(Date.now());
  return `${payload}.${sign(payload)}`;
}

// Returns { ok: true } or { ok: false, reason } where reason is one of:
// 'missing', 'invalid', 'too_fast', 'expired'.
function checkToken(token) {
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' };
  const [payload, sig] = parts;
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(sign(payload), 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid' };
  }
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'invalid' };
  const age = Date.now() - issuedAt;
  if (age < 0) return { ok: false, reason: 'invalid' };
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

module.exports = { issueToken, checkToken, MIN_FILL_MS, MAX_AGE_MS };
