// POST /api/admin/create-client  { token, name } -> clientId (string)
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name_required' });
    return;
  }
  try {
    const clientId = await callAdminRpc('create_client_admin', { p_name: name });
    res.status(200).json(clientId);
  } catch (e) {
    console.error('create-client failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
