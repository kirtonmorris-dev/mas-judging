// POST /api/admin/create-event  { token, clientId, name, slug } -> eventId (string)
const { requireAuthedPost, callAdminRpc } = require('../_lib/adminAuth');

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
  try {
    const eventId = await callAdminRpc('create_event_admin', {
      p_client_id: clientId,
      p_name: name,
      p_slug: slug || null,
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
