// POST /api/admin/list-events  { token } -> Event[]
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  try {
    const events = await callAdminRpc('list_events_admin', {});
    res.status(200).json(events);
  } catch (e) {
    console.error('list-events failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
