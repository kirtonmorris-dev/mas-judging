// POST /api/admin/auth  { pin } -> { token } | 401
// The only place ADMIN_PIN is ever compared -- server-side, from a Vercel
// env var, never shipped to the browser. Replaces the old client-side
// `val === ADMIN_PIN` check in app/src/views/admin.js.
const crypto = require('crypto');
const { issueToken } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const pin = typeof body.pin === 'string' ? body.pin : '';

  const expected = process.env.ADMIN_PIN || '';
  const pinBuf = Buffer.from(pin);
  const expectedBuf = Buffer.from(expected);
  const same = pinBuf.length === expectedBuf.length && crypto.timingSafeEqual(pinBuf, expectedBuf);

  if (!same) {
    res.status(401).json({ error: 'invalid_pin' });
    return;
  }
  res.status(200).json({ token: issueToken() });
};
