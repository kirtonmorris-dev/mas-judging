// Live spam-protection test for POST /api/lead. Node 18+, no dependencies.
//
//   node scripts/lead-spam-test.mjs                 # honeypot, too fast, missing/tampered token
//   node scripts/lead-spam-test.mjs --rate-limit    # also the rate limit (see warning)
//   node scripts/lead-spam-test.mjs https://www.judgedshow.com --rate-limit
//
// Every test lead uses an obviously fake "zz.spam.*@example.com" address.
// Expected: the four spam cases get a normal 200 {ok:true} (bots learn nothing),
// are stored in `leads` as spam_honeypot / spam_too_fast, and NEVER reach HubSpot.
//
// WARNING for --rate-limit: it submits 6 valid leads from YOUR IP. The first 5
// are real accepted leads (5 HubSpot test contacts to delete afterward) and the
// 6th should get HTTP 429. Your IP then cannot submit the real form for up to
// an hour. Clean up: delete the zz.spam.* contacts in HubSpot and run
//   delete from public.leads where email like 'zz.spam.%';
const BASE = (process.argv.find((a) => a.startsWith('http')) || 'https://www.judgedshow.com').replace(/\/$/, '');
const RATE = process.argv.includes('--rate-limit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getToken = async () => (await (await fetch(`${BASE}/api/lead`)).json()).token;
const post = async (body) => {
  const res = await fetch(`${BASE}/api/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return `${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`;
};
const lead = (tag, extra = {}) => ({
  name: 'ZZ Spam Test', email: `zz.spam.${tag}@example.com`, organization: 'ZZ Spam Test',
  pageUri: `${BASE}/`, ...extra,
});

const out = [];
const run = async (label, fn) => { const r = await fn(); out.push([label, r]); console.log(label.padEnd(30), r); };

console.log(`Target: ${BASE}\n`);
await run('1 token endpoint', async () => ((await getToken()) ? '200 token issued' : 'NO TOKEN'));
const tok = await getToken();
await sleep(4500); // past the 3-second minimum fill time
await run('2 honeypot filled', () => post(lead('honeypot', { token: tok, company_website: 'http://spam.example' })));
await run('3 too fast (fresh token)', async () => post(lead('toofast', { token: await getToken() })));
await run('4 missing token', () => post(lead('notoken')));
await run('5 tampered token', async () => { const t = await getToken(); await sleep(4000); return post(lead('tampered', { token: t.slice(0, -1) + (t.endsWith('0') ? '1' : '0') })); });
await run('6 unknown field rejected', async () => { const t = await getToken(); await sleep(4000); return post(lead('unknown', { token: t, evil: 1 })); });
if (RATE) {
  for (let i = 1; i <= 6; i++) {
    const t = await getToken(); await sleep(3500);
    await run(`7.${i} valid submit #${i}`, () => post(lead(`rl${i}`, { token: t })));
  }
}
console.log('\nNow tell Claude it finished, and it will check the leads table and HubSpot.');
