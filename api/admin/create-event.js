// POST /api/admin/create-event  { token, clientId, name, slug, eventContactName?, eventContactEmail?, eventContactPhone? } -> eventId (string)
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');
const { parseEventContact } = require('../_lib/contactValidation');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const clientId = typeof body.clientId === 'string' ? body.clientId : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!clientId || !name) {
    res.status(400).json({ error: 'client_and_name_required' });
    return;
  }
  const contact = parseEventContact(body);
  if (contact.error) {
    res.status(400).json({ error: contact.error });
    return;
  }
  try {
    const eventId = await callAdminRpc('create_event_admin', {
      p_client_id: clientId,
      p_name: name,
      p_slug: slug || null,
      p_event_contact_name: contact.values.name,
      p_event_contact_email: contact.values.email,
      p_event_contact_phone: contact.values.phone,
    });
    res.status(200).json(eventId);
  } catch (e) {
    if (e.body && e.body.includes('events_slug_key')) {
      res.status(409).json({ error: 'slug_taken' });
      return;
    }
    console.error('create-event failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
