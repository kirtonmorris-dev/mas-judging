// Supabase access for the `leads` table, via the service-role key (the table
// has RLS on, no policies, and no anon grants). Prefixed "_" so Vercel does
// not deploy it as a route.
function headers(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}
function base() { return `${process.env.SUPABASE_URL}/rest/v1/leads`; }

async function fail(what, res) {
  const err = new Error(`${what} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  err.status = res.status;
  throw err;
}

async function insertLead(row) {
  const res = await fetch(base(), { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) });
  if (!res.ok) await fail('insertLead', res);
  const rows = await res.json();
  return rows[0];
}

async function updateLead(id, patch) {
  const res = await fetch(`${base()}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
  if (!res.ok) await fail('updateLead', res);
}

// How many accepted submissions this hashed IP made since `sinceIso`.
async function countAccepted(ipHash, sinceIso) {
  const url = `${base()}?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&status=eq.accepted&created_at=gte.${encodeURIComponent(sinceIso)}`;
  const res = await fetch(url, { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) });
  if (!res.ok) await fail('countAccepted', res);
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

// Rows still waiting to reach HubSpot (used by scripts/resend-failed-leads.mjs).
async function listUnsent() {
  const url = `${base()}?select=*&status=eq.accepted&hubspot_status=in.(failed,pending)&order=created_at.asc&limit=500`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) await fail('listUnsent', res);
  return res.json();
}

module.exports = { insertLead, updateLead, countAccepted, listUnsent };
