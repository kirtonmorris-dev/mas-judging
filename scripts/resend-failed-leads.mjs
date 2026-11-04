// Resend leads that never reached HubSpot (hubspot_status 'failed' or 'pending').
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   HUBSPOT_PORTAL_ID=245957556 HUBSPOT_FORM_GUID=... \
//   node scripts/resend-failed-leads.mjs [--dry-run]
//
// Run it locally or in a Vercel shell; the keys never go in the repo.
// Spam rows are never resent (only status = 'accepted'). The original visitor
// IP is not stored (only a hash), so resent submissions carry no ipAddress.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { listUnsent, updateLead } = require('../api/_lib/leadStore.js');
const { submitLeadToHubSpot } = require('../api/_lib/hubspot.js');

const dryRun = process.argv.includes('--dry-run');
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'HUBSPOT_PORTAL_ID', 'HUBSPOT_FORM_GUID']) {
  if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }
}

const rows = await listUnsent();
console.log(`${rows.length} lead(s) to resend${dryRun ? ' (dry run)' : ''}`);
let sent = 0, failed = 0;
for (const row of rows) {
  if (dryRun) { console.log(`- ${row.created_at} ${row.email} (${row.hubspot_status})`); continue; }
  const hs = await submitLeadToHubSpot(row, null);
  await updateLead(row.id, {
    hubspot_status: hs.ok ? 'sent' : 'failed',
    hubspot_http_status: hs.status || null,
    hubspot_error: hs.ok ? null : hs.error || null,
  });
  if (hs.ok) sent++; else failed++;
  console.log(`${hs.ok ? 'sent  ' : 'FAILED'} ${row.email} ${hs.ok ? '' : hs.status + ' ' + hs.error}`);
}
if (!dryRun) console.log(`Done: ${sent} sent, ${failed} failed`);
