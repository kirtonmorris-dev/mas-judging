// POST /api/admin/list-clients  { token } -> Client[]
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  try {
    const clients = await callAdminRpc('list_clients_admin', {});
    res.status(200).json(clients);
  } catch (e) {
    console.error('list-clients failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
