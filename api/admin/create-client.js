// POST /api/admin/create-client  { token, name, contactName, contactEmail, contactPhone } -> clientId (string)
// 400 error codes: name_required, contact_name_required, contact_email_required,
// contact_email_invalid, contact_phone_required, contact_phone_invalid
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');
const { parseClientFields } = require('../_lib/contactValidation');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const parsed = parseClientFields(body);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.values;
  try {
    const clientId = await callAdminRpc('create_client_admin', {
      p_name: v.name,
      p_contact_name: v.contactName,
      p_contact_email: v.contactEmail,
      p_contact_phone: v.contactPhone,
    });
    res.status(200).json(clientId);
  } catch (e) {
    console.error('create-client failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
