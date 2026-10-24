// POST /api/admin/update-event-contact  { token, eventId, eventContactName, eventContactEmail, eventContactPhone } -> {}
// Edits ONLY the three event-day contact fields. All three optional; empty -> NULL.
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');
const { parseEventContact } = require('../_lib/contactValidation');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!eventId) {
    res.status(400).json({ error: 'event_id_required' });
    return;
  }
  const parsed = parseEventContact(body);
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const v = parsed.values;
  try {
    await callAdminRpc('update_event_contact_admin', {
      p_event_id: eventId,
      p_event_contact_name: v.name,
      p_event_contact_email: v.email,
      p_event_contact_phone: v.phone,
    });
    res.status(200).json({});
  } catch (e) {
    if (e.body && e.body.includes('unknown_event')) {
      res.status(404).json({ error: 'event_not_found' });
      return;
    }
    console.error('update-event-contact failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
