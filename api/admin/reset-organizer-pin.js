// POST /api/admin/reset-organizer-pin  { token, eventId } -> { pin: "1234" }
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const body = requireAuthedPost(req, res);
  if (!body) return;
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  if (!eventId) {
    res.status(400).json({ error: 'event_id_required' });
    return;
  }
  try {
    const pin = await callAdminRpc('reset_event_organizer_pin', { p_event_id: eventId });
    res.status(200).json({ pin });
  } catch (e) {
    console.error('reset-organizer-pin failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
