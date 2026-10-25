// POST /api/admin/reopen-scoring  { token, eventId } -> { reopened: boolean }
// Reopens judging for a closed event. Admin only (service_role RPC); the close
// and every reopen are recorded in event_lock_log. Idempotent: reopening an
// event that is not closed returns { reopened: false }.
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
    const result = await callAdminRpc('reopen_event_scoring_admin', { p_event_id: eventId });
    res.status(200).json({ reopened: !!(result && result.reopened) });
  } catch (e) {
    if (e.body && e.body.includes('event_not_found')) {
      res.status(404).json({ error: 'event_not_found' });
      return;
    }
    console.error('reopen-scoring failed', e);
    res.status(502).json({ error: 'upstream_failed' });
  }
};
