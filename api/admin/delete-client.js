// POST /api/admin/delete-client  { token, clientId } -> {}
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'client_id_required' });
    return;
  }
  try {
    await callAdminRpc('delete_client_admin', { p_client_id: clientId });
    res.status(200).json({});
  } catch (e) {
    if (e.body && e.body.includes('client_has_events')) {
      res.status(409).json({ error: 'client_has_events' });
      return;
    }
    console.error('delete-client failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
