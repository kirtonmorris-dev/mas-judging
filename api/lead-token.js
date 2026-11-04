// GET /api/lead-token -> { token }
// Issued when the lead modal opens. See api/_lib/leadToken.js.
const { issueToken } = require('./_lib/leadToken');

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ token: issueToken() });
  } catch (e) {
    console.error('lead-token failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
};
