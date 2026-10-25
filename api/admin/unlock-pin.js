// POST /api/admin/unlock-pin  { token, eventId } -> { cleared: <number of locked/tracked targets cleared> }
// Clears the organizer-PIN lockout and every judge-PIN lockout for one event.
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
    const cleared = await callAdminRpc('unlock_event_pins_admin', { p_event_id: eventId });
    res.status(200).json({ cleared });
  } catch (e) {
    if (e.body && e.body.includes('event_not_found')) {
      res.status(404).json({ error: 'event_not_found' });
      return;
    }
    console.error('unlock-pin failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
