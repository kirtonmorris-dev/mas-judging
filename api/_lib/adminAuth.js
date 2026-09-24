// Shared helpers for the /api/admin/* serverless functions. Files under
// api/ prefixed with "_" are not deployed as routes by Vercel -- this is
// intentionally not itself callable.
//
// Why this exists: the admin PIN used to be a plaintext constant shipped in
// the browser bundle (app/src/constants.js), and the admin-only Supabase
// RPCs (list_events_admin, list_clients_admin, create_client_admin,
// create_event_admin, delete_client_admin) were granted EXECUTE to the
// `anon` role -- callable directly via REST by anyone with the public
// Supabase URL + publishable key, bypassing the PIN screen entirely (the
// PIN was a client-side UI gate only, never checked by the database). This
// module is the real gate: ADMIN_PIN and ADMIN_TOKEN_SECRET live only as
// Vercel server-side env vars, never sent to the browser, and the admin
// RPCs above had their `anon` EXECUTE grant revoked in the same change (see
// the `lock_down_admin_rpcs` migration) -- they're now only reachable
// through SUPABASE_SERVICE_ROLE_KEY, which only these serverless functions
// hold.
const crypto = require('crypto');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour -- long enough for one admin session, short enough to limit a leaked token's window

function sign(payload) {
  return crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET).update(payload).digest('hex');
}

function issueToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && Date.now() < expires;
}

// Calls a Supabase RPC using the secret service_role key, which bypasses
// RLS/grants entirely -- this is what actually reaches the admin RPCs now
// that `anon` has been revoked. Never expose this key or its response
// shape assumptions to the client beyond what each endpoint explicitly
// returns.
async function callAdminRpc(fnName, body) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${fnName} failed: ${res.status} ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// Standard request guard for every /api/admin/* endpoint except auth.js:
// wrong method -> 405, missing/expired/invalid token -> 401. Returns the
// parsed JSON body on success, or null after already sending an error
// response (caller should just `return` in that case).
function requireAuthedPost(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return null;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!verifyToken(body.token)) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return body;
}

module.exports = { issueToken, verifyToken, callAdminRpc, requireAuthedPost };
