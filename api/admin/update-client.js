// POST /api/admin/update-client  { token, clientId, name, contactName, contactEmail, contactPhone } -> {}
// Same required fields and 400 codes as create-client, plus client_id_required.
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');
const { parseClientFields } = require('../_lib/contactValidation');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  if (!clientId) {
    res.status(400).json({ error: 'client_id_required' });
    return;
  }
  const parsed = parseClientFields(body);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.values;
  try {
    await callAdminRpc('update_client_admin', {
      p_id: clientId,
      p_name: v.name,
      p_contact_name: v.contactName,
      p_contact_email: v.contactEmail,
      p_contact_phone: v.contactPhone,
    });
    res.status(200).json({});
  } catch (e) {
    if (e.body && e.body.includes('unknown_client')) {
      res.status(404).json({ error: 'client_not_found' });
      return;
    }
    // A malformed uuid fails inside Postgres with 22P02.
    if (e.body && e.body.includes('22P02')) {
      res.status(400).json({ error: 'client_id_required' });
      return;
    }
    console.error('update-client failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
