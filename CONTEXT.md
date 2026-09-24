# Judge D Show (formerly "Carnival Judging") — Project Context

This file exists so any future Claude Code session (or human) picking up this
project has the background needed to work on it safely. Read this before
making changes. It reflects the state as of 2026-09-22 (updated same-day for
the client-data-isolation work — see "Client-level data isolation" below) —
if things look different, trust the code over this file and update this file.

## What this is

A live Carnival competition judging app built and owned by Kirt Morris /
Immortelle Advisory Group. Judges score contestants on their phones in real
time; organizers watch results come in on a live tally and print official
sign-off sheets at the end. **Not mas-specific** — `src/competitionLibrary.js`
supports Mas, Panorama (steelband), Calypso, Soca, Chutney, J'ouvert,
Traditional Mas, Stick Fighting, Limbo, Schools Carnival, and Kiddies
Carnival as distinct competition families with their own templates.

Real current users: WIADCA Junior Carnival (Brooklyn) and Baltimore One
Carnival both run live scoring on it. A Panorama competition ("Testing -
Panorama") is set up as a sandbox/test event — safe to use for any live
testing that needs real data without touching real events.

**Data discrepancy found 2026-09-22, not yet resolved**: as of this date,
Supabase only has three events — `Testing - Panorama` (sandbox), `West
Indian American Day Carnival Association — Junior Carnival` (real data: 6
judges, 5 categories, 49 contestants, 58 scores submitted), and `WIADCA -
Monday Mas` (3 judges added, but zero categories/contestants/scores — never
actually run). **There is no Baltimore One Carnival event in this database
at all.** Marketing copy was updated this session to state only the
verified WIADCA-derived counts (referred to publicly as "an NYC Carnival
competition," per the existing no-named-orgs-without-permission rule) and
to keep the Baltimore claim intentionally vague rather than inventing
numbers for it — see "Marketing site work shipped this session" below. If
Baltimore's real event data lives in a different Supabase project, a
spreadsheet, or hasn't been entered yet, find out which before citing any
Baltimore-specific numbers publicly.

**Branding**: the app was renamed from "Carnival Judging" to **"Judge D
Show"** (domain `judgedshow.com`, defensive alt `judgedeshow.com`). The
rename is applied throughout user-facing text and code comments/doc
references (`index.html`, `README.md`, `src/main.js` header comment,
`scripts/stress-test.mjs` comment, this file). Domain purchase and the
background-visual redesign are still open — see "Pending business/marketing
items" below.

## URL structure — marketing site vs. the app

The repo root now serves **two separate static pages**, split so the
judging app isn't the first thing a prospect hits:

- **`/` (repo root `index.html`)** — the marketing/landing page. A
  self-contained static page (own inline styles, own fonts — Fraunces +
  IBM Plex Sans, distinct from the app's Bebas Neue + Inter), anchor
  links to its own sections, "Book a Call"/"Request a Quote" buttons to
  Calendly. **Do not wire this into the app** — no Supabase, no judging
  logic, nothing beyond static content and anchor links to itself. It is
  indexed by search engines (no robots meta tag).
- **`/app` (`app/index.html`, `app/styles.css`, `app/src/`)** — the
  actual judging app (PIN login, judge scoring, organizer tally, print
  flows, everything described below). This *is* what used to live at the
  repo root before the marketing page existed. It carries a
  `<meta name="robots" content="noindex">` tag so the PIN-entry screen
  doesn't show up in search results.
- No `vercel.json` exists or is needed — Vercel's static file serving
  picks up `/app/index.html` for requests to `/app` automatically, and
  does **not** redirect `/app` to `/app/` (no trailing slash added).
- **`app/index.html`'s top-level `<link href>`/`<script src>` are
  origin-absolute (`/app/styles.css`, `/app/src/main.js`), not relative.**
  This was a real shipped bug during the root→`/app` move: with the
  document served at the trailing-slash-less URL `/app`, a *relative*
  reference like `href="styles.css"` resolves against `/` (the parent of
  the URL's last path segment), not `/app/` — so the browser was actually
  requesting `/styles.css` and `/src/main.js`, both 404, and the app's
  module script never ran at all. Production was stuck on the static
  "Loading scoresheet…" shell (unstyled, since the CSS 404'd too) for
  real users until this was caught and fixed. Nested ES module imports
  *inside* `src/main.js` (e.g. `import ... from './api.js'`) are fine as
  relative paths — module specifiers resolve against the *importing
  module's own URL*, not the document's — it is specifically the
  document's own top-level `<link>`/`<script src>` tags that need to be
  absolute. If `/app`'s assets ever move again, keep these absolute or
  add a `vercel.json` redirect from `/app` to `/app/` and verify the
  fix by loading the page in a real browser (or curl -IL following
  redirects), not just by fetching hand-constructed absolute file paths
  — that's how this slipped through review the first time.
- **Known tradeoff**: existing judges/organizers (WIADCA, Baltimore) who
  bookmarked the old root URL will land on the marketing page after this
  ships, not the login screen. Decided explicitly: no login link was
  added to the marketing page nav, and the plan is to message the new
  `/app` URL to those organizers directly rather than add navigation
  clutter to the marketing page. Keep this in mind before pointing the
  `judgedshow.com` domain — decide whether the domain root goes to `/`
  (marketing) or `/app` (straight to login) once purchased.

## Architecture

- **Modular vanilla JS, ES modules**, no build step, no framework, no
  bundler. Entry point `app/index.html` loads `app/src/main.js` as
  `type="module"`. Source is organized under `app/src/`: `api.js` (all
  Supabase I/O), `state.js` (single mutable state object), `views/`
  (judge.js, organizer.js, setup.js, tally.js, judgeDetail.js,
  shared.js, **admin.js** — see "Client-level data isolation" below),
  `utils.js`, `constants.js`, `competitionLibrary.js`,
  `historicalLoaders.js`, `importParsers.js`, `print.js`, `ui.js`.
- **Every judge/organizer page load is bound to exactly one event**, read
  from a `?event=<id>` URL query param (`main.js`) — there is no in-app
  event picker/dropdown anymore. `?mode=organizer` starts on the Organizer
  tab (still PIN-gated); default is the Judge tab. A separate `?admin=1`
  entry point (its own PIN, its own render path in `admin.js`) is the only
  place that lists events/clients across the whole database or creates a
  new event. See "Client-level data isolation" for why.
- **External library**: SheetJS (xlsx), loaded from cdnjs.cloudflare.com,
  for reading uploaded Excel files.
- **Fonts**: Google Fonts (Bebas Neue + Inter).
- **No server-side code.** All logic runs in the browser; the browser talks
  straight to Supabase's REST/RPC endpoints.
- **Dev tooling**: `scripts/stress-test.mjs` — a standalone Node 18+ script
  (no deps) that load-tests the Supabase backend's concurrency safety
  against a disposable synthetic event. Run with `node scripts/stress-test.mjs`
  before a live event or after any backend change. Last run: 20 concurrent
  judges, 600 writes, zero errors.
- **Image assets**: a root-level `images/` folder (referenced as
  `/images/...` from `index.html`, following the same origin-absolute
  convention as `/app`'s assets) holds marketing-page images —
  `kirt-headshot.jpg`, `judge-pin-entry.png`, `organizer-setup.png`,
  `judge-scoring-list.png` (saved, not yet used). Follow this convention
  for new marketing-page images rather than inventing a new folder.

## Deployment

- **Hosting**: Vercel, project `mas-judging`, team `kirt-morris-projects`.
- **Live URLs**: marketing page at
  https://mas-judging-kirt-morris-projects.vercel.app/, the app at
  https://mas-judging-kirt-morris-projects.vercel.app/app (see "URL
  structure" above).
- **Git-push-to-deploy IS wired up**: pushing a feature branch to
  `kirtonmorris-dev/mas-judging` on GitHub triggers a Vercel *preview*
  deploy; pushing/merging to `main` triggers a *production* deploy.
  Standard workflow used throughout this project: create a feature branch →
  push → verify on the preview URL (ask the human to click through it if
  your sandbox can't reach the deployed URL directly — see below) → merge
  `--no-ff` into `main` → push → verify production.
- **Deployment Protection is OFF** — was previously blocking judges via
  Vercel's own auth gate; if the app is ever unreachable for users, check
  Vercel project Settings → Deployment Protection first.

### ⚠️ Network access varies by sandbox

Some sandboxed Claude Code environments cannot reach `*.vercel.app` or
`supabase.co` directly (egress allowlist blocks them) even though the
Supabase MCP tools still work (they don't go through the same network
path). If direct `fetch`/`curl`/Playwright to the live URL fails, that's
expected — verify via the Vercel MCP tools' `web_fetch_vercel_url` (static
file fetch works) and Supabase MCP's `execute_sql`/`query_logs` (DB-level
verification), and ask the human to click through the actual UI on their
own device before merging anything to `main`. This has been the working
pattern for every feature shipped so far.

## Database (Supabase) — normalized schema, NOT a JSON blob

Project URL: `https://pjqojhtqxljnukwlzekr.supabase.co`. Publishable key is
already embedded in `src/constants.js` (not a secret — the whole security
model is app-level PIN gates, not DB-level auth; anon key has full
read/write on everything, same as before).

**The schema was fully normalized in this project's lifetime** (migrating
off a single `mas_judging_data(id, data jsonb)` blob table). Current tables:
`clients`, `events`, `judges`, `categories`, `contestants`, `scores`,
`score_history`, `config_meta`. Key points:

- **`scores`** has a composite primary key
  `(event_id, category_id, contestant_id, judge_slot)`. Every judge
  submission is a single-row `INSERT ... ON CONFLICT DO UPDATE` (upsert),
  done via `src/api.js`'s `saveScoreEntry`/`saveOrganizerScoreEdit`/
  `saveScoresMerge`. **This is what fixed a real production bug**: the old
  blob model let a judge's stale in-memory copy silently overwrite another
  judge's newer submission under concurrent load. The new model makes that
  structurally impossible — verified by direct concurrency testing (see
  `scripts/stress-test.mjs`) and confirmed working live by the user.
- **Config (events/judges/categories/contestants) writes go through
  `replace_event_config(p_event_id, p_event, p_expected_rev)`** — an
  event-scoped RPC that atomically replaces *one* event's judges/
  categories/contestants (never any other event's rows), with an
  optimistic-concurrency check against that event's own `events.rev`
  column. Reads go through the matching event-scoped `get_event_config
  (p_event_id)`. **These replaced the original whole-database
  `get_config()`/`replace_config(p_events, p_expected_rev)` RPCs**, which
  returned/replaced *every* event, judge (including plaintext PINs),
  category, and contestant in the database on every call, regardless of
  which event the caller actually needed — see "Client-level data
  isolation" below for the full story. **The old RPCs were dropped
  2026-09-23** (see "Client-level data isolation" below for the migration).
- **`score_history`** is now an append-only per-change audit log (one row
  per changed score), not the old capped 10-snapshot blob backup.
- **The old `mas_judging_data` table still exists, untouched**, as a
  rollback safety net. Don't delete it without a deliberate decision to do so.
- **Two real gotchas hit during migration** — worth knowing before touching
  RLS or DB functions again:
  1. RLS policies must be added explicitly per table/command; a missing
     INSERT/UPDATE/DELETE policy fails *silently* as far as `execute_sql`
     testing goes, because that tool runs as a privileged role that
     bypasses RLS entirely. Test as `anon` (`set local role anon;`) to
     actually catch RLS gaps.
  2. Supabase enforces "DELETE/UPDATE requires a WHERE clause" as an
     API-layer safety net that does **not** apply to direct SQL sessions
     (like the MCP tool's own connection) — only to the real PostgREST/Data
     API path. An unconditional `delete from events;` inside a
     `plpgsql` function worked fine when tested via SQL directly, then
     failed with a real judge/organizer click. If a DB function does a
     bulk delete, give it a `where true` (or a real condition) and test the
     *actual* API path (or ask the human to click it), not just SQL.
- **Anon key security model, updated 2026-09-23**: `scores`/`score_history`
  still have full public read/write via direct REST (no DB-level auth,
  PIN gates are app-only — a known, accepted tradeoff, not an oversight).
  `events`/`judges`/`categories`/`contestants` are now locked down —
  direct anon `SELECT`/`INSERT`/`UPDATE`/`DELETE` on those four tables is
  gone; everything goes through the event-scoped RPCs (which run
  `security definer`, owned by `postgres`, and take an explicit
  `p_event_id`) — see "Client-level data isolation" for the exact
  migration that was applied.

## Client-level data isolation (added 2026-09-22)

**The problem this fixed**: every judge- and organizer-facing page loaded
the *entire* database on every page load — every event, every judge's
plaintext PIN, every category, every contestant, across every client —
regardless of which event the visitor actually had a link/PIN for. The
event picker dropdown (removed) showed every client's events side by side
in both the Judge and Organizer tabs. This was found during a client-data-
isolation audit and fixed the same day; see the audit conversation for the
full before/after.

**What changed**:

- **New `clients` table** (`id uuid`, `name`, `contact_name`,
  `contact_email`, `contact_phone`, `created_at`) and `events.client_id`
  (FK, `not null`). Backfilled: `West Indian American Day Carnival
  Association — Junior Carnival` and `WIADCA - Monday Mas` →
  "WIADCA (West Indian American Day Carnival Association)"; `Testing -
  Panorama` → "Internal Test / Sandbox". Baltimore has no event row in this
  database at all (see the data-discrepancy note above) so no client was
  created for it — do that when its real event data actually shows up here.
- **Every judge/organizer session is now bound to exactly one event** via
  a `?event=<id>` URL param (`main.js` reads it into `state.eventId` before
  anything loads; missing/invalid param → an explicit error screen, no
  fallback to "the first event" or any other event). There is no dropdown
  to switch events from the Judge or Organizer tab anymore.
- **New event-scoped RPCs**, all `security definer`, all taking an explicit
  `p_event_id` and touching only that event's rows: `get_event_config`,
  `replace_event_config`, `delete_event_own`. `fetchScores()` in `api.js`
  now always filters `?event_id=eq.<id>` (previously unfiltered — every
  judge/organizer page pulled every score row in the database).
- **New admin view** (`app/src/views/admin.js`, reached only via
  `/app?admin=1`, gated by its own `ADMIN_PIN` in `constants.js` — separate
  from the judge/organizer `ORG_PIN`). This is the *only* code path that
  can see more than one event/client at once, via its own RPCs
  (`list_events_admin`, `list_clients_admin` — id/name only, no judges, no
  PINs, no contestants) or create a new client/event
  (`create_client_admin`, `create_event_admin`). It shares no query with
  the judge/organizer views — there is no flag anywhere that widens a
  normal session into this one. Each event row in the admin list has
  "Judge link"/"Organizer link" buttons that copy the link to the clipboard
  **and** open it in a new tab (`window.open(link, '_blank', 'noopener')` —
  added after the user asked for the new-tab behavior; copy-only was the
  original design).
- **New ids use `crypto.randomUUID()`** (`uid()` in `utils.js`), not
  `Math.random().toString(36)`. Existing WIADCA/Testing event/category/
  contestant ids were left as their original short strings — only newly
  created rows get real UUIDs. This matters now that `scores`/
  `score_history` stay directly queryable by id (see below) — an unguessable
  id is doing real work, not just cosmetic.
- **Old `get_config()`/`replace_config()` RPCs — dropped 2026-09-23.** They
  were left in place, unused by the new code, until the new code had been
  live on `main` long enough to trust nothing still depended on them
  (dropping them immediately would have broken production for real WIADCA
  users still on the old deployed code during testing). Confirmed via
  `grep` across `app/src/` that neither name was referenced anywhere in
  the app, then dropped both functions outright in the same migration
  that locked down the four tables below (migration
  `drop_old_rpcs_and_lock_down_config_tables`, applied directly to the
  `pjqojhtqxljnukwlzekr` project — this app has no separate
  branch/env, it's one shared production database). `scripts/
  stress-test.mjs`'s Scenario 4 (and its `setupTestEvent`/
  `cleanupTestEvent` helpers) were rewritten in the same commit to go
  through `create_event_admin`/`replace_event_config`/`get_event_config`/
  `delete_event_own`/`list_events_admin`/`list_clients_admin` instead of
  direct table writes or the dropped RPCs — direct anon inserts to
  `events`/`judges`/`categories`/`contestants` no longer work either (see
  below), so the script's setup/cleanup had to move to the RPCs too.

**What's honestly still a limitation, not a gap to code around**: there is
no real login system, and the anon key is public by design. RLS cannot
tell *which* judge or organizer is asking, so it cannot enforce "this
browser may only ever see event X" the way real per-user auth would. What
exists instead: no code path fetches more than one event's data, and
(as of the RLS lockdown above) no one can bypass the app to hit
`events`/`judges`/`categories`/`contestants` directly either — only the
scoped RPCs can read/write them. `scores`/`score_history` stay directly
queryable by anyone who has a specific event's id (needed for the
concurrency-safe upsert pattern), same risk model as before, just now
correctly scoped to one event instead of returning everything.

**Fixed 2026-09-24** (was previously a known gap here): the Organizer PIN
used to be one shared value (`ORG_PIN`, `2026`) across *every* event/client
— anyone who knew it could open the Organizer tab for any event's link,
including a brand-new client's, even though the underlying data was already
correctly isolated. Each event now has its own `organizer_pin`, generated
at creation and resettable from the admin panel. See "Per-event organizer
PIN" further down for the full writeup.

**RLS lockdown — applied 2026-09-23.** Migration
`drop_old_rpcs_and_lock_down_config_tables`, run directly against the
`pjqojhtqxljnukwlzekr` project (single shared production database, no
separate branch/env):

1. `drop function if exists public.get_config();` and
   `drop function if exists public.replace_config(jsonb, integer);`
2. For each of `events`, `judges`, `categories`, `contestants`: dropped
   the four wide-open `"public read"`/`"public write"`/`"public update"`/
   `"public delete"` policies (`USING (true)`/`WITH CHECK (true)`, role
   `public`) and ran `revoke select, insert, update, delete on table
   public.<table> from anon;`. RLS stays enabled on all four with zero
   policies left, which is default-deny for every role except a table
   owner (or a role with `BYPASSRLS`) — the event-scoped RPCs
   (`get_event_config`, `replace_event_config`, `delete_event_own`,
   `list_events_admin`, `list_clients_admin`, `create_event_admin`,
   `create_client_admin`, `delete_client_admin`, `resolve_event_slug`) are
   all `security definer` and owned by `postgres`, which also owns these
   four tables, so they keep working unaffected (table owners bypass RLS).
   Only `anon` was revoked, not `authenticated` — this app has no real
   login and never issues requests as `authenticated`, so that grant was
   left alone rather than touched on a guess.
3. `scores`/`score_history` were **not touched** — they keep their
   existing open policies (anon `SELECT`/`INSERT`/`UPDATE`/`DELETE`, no
   `USING`/`WITH CHECK` restriction) since the app's concurrency-safe
   upsert pattern needs direct table access — isolation there still comes
   from the app always filtering by `event_id`, not from RLS. `clients`/
   `config_meta` were left alone too.

**Verified post-migration**: as `anon` (`set local role anon;`), a direct
`select * from judges` now fails with `permission denied for table
judges`; `get_event_config('<real event id>')` still returns only that
one event's judges/categories/contestants correctly scoped; `get_config`/
`replace_config` no longer exist in `pg_proc` at all (any REST call to
`rpc/get_config` now gets PostgREST's function-not-found error). Security
advisors show only expected findings (the RPCs being anon-callable
`security definer` functions is intentional — that's the whole PIN-gate
model — and `rls_enabled_no_policy` on the four locked-down tables is the
point of this migration, not a gap).

## Data model (conceptual shape, now split across normalized tables)

```
event: { id, name, scope, active, competitionFamily, competitionType,
         contestantLabel, contestantLabelPlural, fieldLabels }
judge (per event): { name /* masked "Judge N" */, realName, pin }
category (per event): { id, name, entryType: 'individual'|'group',
                         criteria: [{key,label,max}], stages, extraFields }
contestant (per category): { id, band, masquerader, portrayal, extra,
                              assignedJudges: [judgeName,...] }
score row (composite key event|category|contestant|judgeSlot):
  { [criterionKey]: number, ..., judge, event, category, contestant,
    submittedAt, editedByOrganizer?, previousValues?, lastEditedAt?,
    totalOnly? }
```

- `entryType: 'individual'` → Band + Masquerader + Portrayal (e.g. King/Queen).
- `entryType: 'group'` → Band + Portrayal only (band/steelband-style).
- Each category has its own independent criteria (labels + point maxes).

## Judge blinding (masked names) — do not undo this

- `name` — masked label ("Judge 1", "Judge 2", ...), the **internal
  identifier** everywhere (assignment, score keys, Live Tally, Judge
  Detail, print sheets, judge picker).
- `realName` — shown only in Organizer → Setup, so the organizer can track
  who's who.

Judges don't self-register. The organizer adds each judge by real name in
Setup; the app assigns the next "Judge N" label. Judges pick their
pre-assigned slot and set a 4-digit PIN the first time they use it.
**Never reintroduce free-text judge name entry on the Judge tab** — that
was the original design and was removed because it let every judge see
every other judge's real name.

## UX work shipped this session (all merged to `main`)

1. **Judging flow speed** (`src/views/judge.js`): tap `+`/`-` stepper
   buttons next to each criterion (typing still works); a `beforeunload`
   guard plus a distinct "In Progress" badge for any contestant with an
   unsubmitted draft (`draftHasUnsavedWork` in `utils.js`). Auto-advance to
   the next contestant after submit was tried and **explicitly rejected**
   by the user — bands don't perform in list order, so don't reintroduce it.
2. **Feedback & error states** (`src/api.js`, `src/ui.js`, `app/index.html`):
   every "Save failed" toast now embeds a Retry button that re-runs the
   exact same save (`showToast(msg, isErr, retryFn)`); error toasts stay
   up longer (3.2s/6s vs 1.8s for success); a proactive offline banner
   (`#connBanner`, `initConnectionBanner()` in `ui.js`) via
   `navigator.onLine`; initial-load failure shows a real Retry button.
3. **Organizer setup usability** (`src/views/setup.js`,
   `src/views/organizer.js`): `confirm()` dialogs before removing a judge,
   category, contestant, criterion, or stage (event removal already had
   one). A contestant-level filter appears inside any expanded category
   with >5 entries (`state.contestantFilters`), with focus/cursor
   preserved across the re-render (the re-render replaces
   `#categoriesListContainer`'s innerHTML, which would otherwise steal
   focus from the filter input mid-keystroke).

Collapsible sections (category cards, competition settings) and a
category-name filter already existed before this session and needed no
changes.

4. **Bulk judge import via CSV/Excel** (`src/views/setup.js`,
   `src/views/organizer.js`): an "Upload list…" button next to the
   existing manual "Add judge" row expands a file picker
   (`#judgeUploadBox`, `.xlsx`/`.xls`/`.csv` via SheetJS, same pattern as
   the existing contestant workbook import). It reads a column named
   Name/Judge/"Judge Name"/"Real Name" (case-insensitive), skips rows
   with no name, skips names already on the event's judges list or
   repeated within the file (case-insensitive), and assigns each new name
   the next "Judge N" slot — PIN is still self-set on first login, same
   as manual add. The status line + toast distinguish "no name column /
   all rows blank" from "all names already on the list" so the message
   is actually accurate, and the status line is explicitly restored after
   the `render()` call (which would otherwise wipe it instantly). The
   manual single-add path (`setupAddJudge`) now shares the same
   case-insensitive duplicate check — it used to accept a re-typed
   existing name and silently create a second "Judge N" for the same
   person.

## Marketing site + app work shipped 2026-09-22 (all merged to `main`)

1. **Offline claim corrected** (`index.html`, "Why It's Different"): the
   section previously claimed "automatic retry" and implied scoring
   continues uninterrupted offline. Neither is true — there's no local
   draft persistence and no automatic sync. Rewrote the copy to match
   actual behavior: the app detects offline state and warns immediately,
   and a failed save gets a one-tap manual retry once reconnected. This
   was an explicit **Option A (copy fix only)** decision, not Option B
   (building real offline queueing) — don't restore stronger offline
   language without actually building that first.
2. **Founder trust section added** (`index.html`, between "Why It's
   Different" and "Where It's Been Used"): 3-sentence bio using Kirt's
   verified background (25+ years enterprise delivery, P&G/Under
   Armour/Lowe's/Canon USA via Merkle/dentsu and Capgemini Ernst & Young),
   with his real headshot (`images/kirt-headshot.jpg`, cropped square with
   headroom above the hairline — the source photo is portrait-oriented and
   naive `object-fit: cover` in a circle clipped the top of his head) linked
   to `immortelleadvisorygroup.com`.
3. **Proof section rewritten with real numbers** (`index.html`, "Where
   It's Been Used"): see the Baltimore data-discrepancy note above for why
   only WIADCA-derived counts are cited, and unnamed ("an NYC Carnival
   competition").
4. **FAQ section added** (`index.html`, between Proof and Pricing): 26
   Q&As, 9 shown by default with a "Show all questions" toggle revealing
   the rest in place. Dependency-free accordion (button +
   aria-expanded/aria-controls region, single-open-at-a-time,
   `prefers-reduced-motion` aware, grid-template-rows animation). Content
   is restricted to verified facts — no export/CSV claims, no
   weighting/multi-round-averaging claims, no security claims beyond
   PIN-gated access, and the connectivity answers match the Option-A
   offline copy above (no automatic-sync claim).
5. **Category list promoted to its own section** (`index.html`, right
   after "How It Works"): the 11 supported competition types used to
   render as low-contrast pills inside the dark "Why It's Different"
   section; now their own white-background section with navy-on-white
   pills for real contrast. Same content, relocated and restyled only.
6. **"On call" copy rewritten** (`index.html`, "Why It's Different"): now
   states Kirt is present in person on event night, not just reachable by
   phone/WhatsApp.
7. **Illustrative app-preview mockups replaced with real screenshots**
   (`index.html`, "How It Works" preview section; images in `images/`):
   the hand-coded fake "Judge View" phone-frame and fake "Organizer View"
   live-tally card are gone. The narrow phone-silhouette frame didn't fit
   a real landscape browser screenshot without cropping or illegible
   shrinking (confirmed directly), so both columns now use the same
   bordered screenshot-card style. Left column: `images/judge-pin-entry.png`
   (PIN entry screen, Testing - Panorama sandbox). Right column:
   `images/organizer-setup.png` (Setup tab showing judges by real name next
   to their masked "Judge N" label and PIN status — showing real names
   here is a deliberate, explicitly confirmed decision, not an accident;
   the underlying judge-blinding design elsewhere in the app is unchanged).
   `images/judge-scoring-list.png` (the judge's "Your Bands" list) was also
   saved but is **not yet used on the page** — held for a future
   three-image layout, confirmed directly rather than forcing an
   unplanned redesign.
8. **Score-edit history surfaced in the organizer UI** (`app/src/api.js`,
   `app/src/views/tally.js`, `app/src/views/organizer.js`,
   `app/src/print.js`, `app/src/utils.js`): `score_history` rows were
   already logged but nothing showed them. Live Tally now has a "View
   edit history" button per category (lists what changed, when, and
   whether it was a judge submission or an organizer correction via
   `fetchScoreHistoryForCategory`), plus a warning badge when a category
   has been edited by the organizer since its sign-off sheet was last
   printed. "Last printed" is tracked **client-side, per browser, in
   `localStorage`** (`getLastPrintedAt`/`setLastPrintedAt` in `utils.js`,
   set from `print.js`'s `printSignoffSheet`/`printAllSignoffSheets`) —
   it's visibility only, not authoritative across devices, and
   deliberately does **not** lock or restrict further edits. No lock/freeze
   mechanism was added; that remains an intentionally-not-built decision
   (see below).
9. **Judge score-submission confirmation** (`app/src/views/judge.js`,
   `app/src/ui.js`): submitting a score now shows an "Undo" action on its
   success toast (`showToast` extended with a generic `actionFn`/
   `actionLabel` param, reused for both "Retry" and "Undo") for about 6
   seconds before being final. The save still persists immediately as
   before — there's no delayed/queued write that could be lost if a
   device closes early — Undo reverts via `saveScoresMerge` to the prior
   value (or deletes the row if it was a new submission). This was chosen
   over a double-tap-to-confirm pattern.

## Pending business/marketing items (not code, but relevant context)

- **Name change to "Judge D Show" is done in code** (`index.html`, `README.md`,
  `src/main.js` header comment, `scripts/stress-test.mjs` comment, this
  file) — same pattern as the earlier rename from "Mas Judging" →
  "Carnival Judging" (see git log on `main`). Still outstanding: the
  `judgedshow.com`/`judgedeshow.com` domain purchase and pointing DNS at
  Vercel, and updating any off-repo references (social profiles, app store
  listings if any, etc.) — none tracked in this codebase.
- **Domain purchase**: `judgedshow.com` (primary) + `judgedeshow.com`
  (defensive alt), ~$11.25/yr each. A Google Calendar reminder is set for
  Tuesday 2026-09-22. The user's existing domain
  (`immortelleadvisorygroup.com`) is registered through **Namecheap**
  (confirmed via nameserver lookup: `dns1/dns2.registrar-servers.com`),
  not Vercel — for consistency, lean toward buying these through Namecheap
  too unless told otherwise.
- **Background visual**: user wants something "more Trini" than the
  current flat navy gradient. First attempt (AI-generated abstract
  texture) failed — the "steelpan" and "mas feather" motifs read as
  petri dishes and ferns, not recognizable Carnival imagery, once
  abstracted for subtlety. A hand-coded SVG alternative (3 variants: pan+
  feather combo, pure steelpan grid, flag-diagonal + sparse feathers) was
  built directly in a Design canvas Artifact for live comparison — user
  didn't like any of the three either. **Currently on hold**, no direction
  chosen. Don't restart this without new input from the user on what
  specifically isn't landing.
- **Go-to-market**: a detailed prompt (covering demo packaging, East
  Coast/Caribbean outreach strategy, and competitor market analysis) was
  drafted for a *separate* Claude chat — this is business/marketing work,
  not something to do inside this coding session unless asked.
- **Marketing-page audit (2026-09-22) is done**: a full pass covering the
  offline claim, founder section, proof numbers, FAQ, category-list
  placement, "on call" copy, and real screenshots all shipped this
  session — see "Marketing site + app work shipped 2026-09-22" above. The
  one item deliberately left undone: the judge's scoring-list screenshot
  (`images/judge-scoring-list.png`) is saved but not placed on the page;
  adding it means either a 3-column/stacked-row redesign of the app-preview
  section or dropping one of the two current screenshots — a layout call
  for whoever picks this up next, not something to decide unilaterally.

## Print flows

Three outputs, all rendered into a hidden `#printArea` div via
`window.print()`, with `@media print` CSS:
1. **Blank scoring sheets** (Setup) — one page per judge per assigned category.
2. **"Print my scores"** (Judge tab) — a judge's own submitted record.
3. **Sign-off sheet** (Live Tally) — tally columns + signature lines, a
   point-in-time snapshot only (doesn't lock the category from further edits).

## Workbook import (multi-sheet Excel upload)

Setup has two import tools (`src/views/organizer.js` +
`src/importParsers.js`):
1. Single-category import — Band/Masquerader/Portrayal columns.
2. Full workbook import — one tab per category; auto-detects the header
   row even with title rows above it, auto-detects Individual vs Group,
   auto-parses criteria + point values from headers like
   `"Color & Impact 30"`.

## One-time admin data loaders

`src/historicalLoaders.js` — `loadBaltimoreHistorical()` and
`loadWIADCAJuniorData()` backfill specific historical spreadsheets. Not
general-purpose; don't use as a template for new events without adjustment.
`loadWIADCAJuniorData()` operates on whichever event is currently selected,
not a hardcoded ID.

## Organizer access

Organizer PIN: per-event now (`events.organizer_pin` in Supabase, not a
client constant) — see "Per-event organizer PIN" below. Every pre-existing
event kept `2026` in the backfill; new events get a random 4-digit PIN at
creation.

Admin PIN: moved server-side 2026-09-24 (see "Admin auth moved server-side"
below) — no longer a client constant.

## Admin auth moved server-side (2026-09-24)

**The problem this fixed**: `ADMIN_PIN` used to be a plaintext constant in
`src/constants.js`, shipped in the browser bundle to every judge/organizer
page (not just `/app?admin=1`) — anyone could read it via view-source. Worse,
that PIN never actually gated anything at the database level: the five
admin-only RPCs (`list_events_admin`, `list_clients_admin`,
`create_client_admin`, `create_event_admin`, `delete_client_admin`) were
`security definer` functions with `EXECUTE` granted to `anon` — and, it turned
out, also still granted to `PUBLIC` from function-creation time, which `anon`
inherits regardless of its own grant. Anyone with the public Supabase URL +
publishable key (both already shipped in `constants.js` by design) could call
these directly via REST — list every client/event across the whole database,
or create a new one — with or without ever knowing the PIN. The PIN screen in
`views/admin.js` was a client-side-only UI gate the whole time.

**What changed**:

- New `/api/admin/*` Vercel serverless functions (`api/admin/auth.js`,
  `list-clients.js`, `list-events.js`, `create-client.js`,
  `create-event.js`, `delete-client.js`), plus a shared helper
  `api/_lib/adminAuth.js` (files under `api/` prefixed `_` aren't deployed
  as routes). `ADMIN_PIN` now lives only as a Vercel server env var, checked
  once in `auth.js`. On success it issues a stateless HMAC-signed token
  (`ADMIN_TOKEN_SECRET` env var, 1-hour TTL, `crypto.timingSafeEqual`
  comparison) — no session storage needed. Every other admin endpoint
  requires that token and calls the underlying RPC using
  `SUPABASE_SERVICE_ROLE_KEY` (also server-only, bypasses grants entirely),
  never the publishable key.
- **DB migrations `lock_down_admin_rpcs` and
  `lock_down_admin_rpcs_revoke_public`** (applied directly to
  `pjqojhtqxljnukwlzekr`, both via Supabase MCP, 2026-09-24): revoked
  `EXECUTE` on the five admin RPCs from both `anon` and `PUBLIC`. Two
  migrations because the first pass (revoke from `anon` only) looked
  sufficient from `aclexplode()` output but wasn't —
  `has_function_privilege('anon', ...)` still returned `true` afterward,
  because Postgres grants `EXECUTE` to `PUBLIC` on function creation by
  default and `anon` inherits through that regardless of its own explicit
  grant. **If auditing RPC grants again, use `has_function_privilege()`,
  not a role-name filter on `aclexplode()`** — the latter silently drops the
  `PUBLIC` grantee row (it isn't a real role, so it won't join to
  `pg_roles`), which is exactly how this got missed the first time.
  `delete_event_own`/`get_event_config`/`replace_event_config`/
  `resolve_event_slug` were deliberately left untouched — those stay
  `anon`-callable by design, since the judge/organizer flow has no server
  boundary and was never the thing this fix targeted.
- **`app/src/views/admin.js`'s PIN gate now calls `adminLogin(pin)`**
  (`api.js`, POSTs to `/api/admin/auth`) instead of comparing against a
  client constant, and stores the returned token in `state.adminToken`.
  Every subsequent admin call (`adminListClients`, `adminListEvents`,
  `adminCreateClient`, `adminCreateEvent`, `adminDeleteClient`) now takes
  `token` as its first argument and hits the matching `/api/admin/*`
  endpoint instead of Supabase directly. A 401 from any of them (expired or
  invalid token) drops the UI back to the PIN gate
  (`handleAdminAuthError` in `admin.js`) rather than failing silently.
- **Vercel env vars required** (server-only, never in the repo):
  `ADMIN_PIN`, `ADMIN_TOKEN_SECRET` (32+ random bytes, unrelated to
  `ADMIN_PIN`), `SUPABASE_SERVICE_ROLE_KEY` (from Supabase dashboard →
  Settings → API — never the publishable key), `SUPABASE_URL` (same value
  already in `src/constants.js`). Set under Project Settings → Environment
  Variables, Production and Preview. **Set 2026-09-24, confirmed working**
  — merged to `main`, verified live on `judgedshow.com/app?admin=1` (old
  PIN rejected, new PIN works).
- `ORG_PIN`'s shared-across-events gap (see "Client-level data isolation"
  above) was **not** fixed by this change — this was specifically the admin
  PIN's client-side exposure and its RPCs' anon-callability. Fixed
  separately the same day — see "Per-event organizer PIN" below.

## Per-event organizer PIN (2026-09-24)

**The problem this fixed**: `ORG_PIN` (`'2026'`) was a single shared
constant gating the Organizer tab for *every* event across *every*
client — anyone who ever learned it (a past organizer, a screenshot, a
person from a different client entirely) could open the Organizer tab for
any client's event link, not just the one they were given. The underlying
*data* was already correctly isolated per event (this PIN never granted
cross-event data access, unlike the admin RPC hole above) — but the access
gate itself didn't distinguish clients.

**What changed**:

- New `events.organizer_pin` column (migration `per_event_organizer_pin`,
  applied directly to `pjqojhtqxljnukwlzekr`). Existing events (WIADCA
  Junior Carnival, WIADCA Monday Mas, Testing - Panorama) were backfilled
  with `'2026'` — their existing PIN keeps working, nothing broke
  mid-season for WIADCA. Confirmed with Kirt before applying: this was a
  deliberate choice over rotating every existing event to a fresh PIN,
  which would have needed re-communicating a new PIN to a live client.
  **New events created via `create_event_admin` get a random 4-digit PIN**
  at creation instead of inheriting anything shared.
- New RPC `check_event_organizer_pin(p_event_id, p_pin) returns boolean` —
  `anon`-callable (same trust model as `get_event_config`/
  `replace_event_config`, scoped by the caller already knowing the event
  id), but it **never returns the real PIN**, only true/false. Confirmed
  `get_event_config` does not select `organizer_pin` in its `jsonb_build_object`
  — so entering Judge mode never exposes the Organizer PIN in the config
  payload either (this was checked deliberately, given it's the same
  mistake class as the admin PIN leak above).
- New admin-only RPC `reset_event_organizer_pin(p_event_id) returns text` —
  generates and stores a fresh random PIN, returns it once for the admin UI
  to display. Same lockdown pattern as the five RPCs from the admin-auth
  fix (`anon`/`PUBLIC` `EXECUTE` revoked at creation, reachable only via the
  service-role-backed `/api/admin/reset-organizer-pin` proxy). `list_events_admin`
  now also returns `organizerPin` per event so the admin panel can display
  it without a separate lookup.
- **`app/src/views/organizer.js`'s PIN gate now calls
  `checkOrganizerPin(eventId, pin)`** (`api.js` → `rpc/check_event_organizer_pin`,
  anon key, no token needed — the RPC itself is the boundary) instead of
  comparing against the removed `ORG_PIN` constant.
- **Admin panel** (`views/admin.js`) shows each event's current organizer
  PIN next to its Judge/Organizer links, with a "Reset PIN" button
  (`adminResetOrganizerPin` → `/api/admin/reset-organizer-pin.js`) for when
  a PIN needs to be rotated (leaked, forgotten, or just a fresh start for a
  new season).
- **No new Vercel env vars needed** — the organizer PIN check is a direct
  anon RPC call (no proxy), and the reset endpoint reuses the
  `ADMIN_TOKEN_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` already set for the
  admin-auth fix above.
- **Merged to `main`, deployed, and verified live on `judgedshow.com/app`**
  2026-09-24: an existing event's old shared PIN (`2026`) still unlocks its
  Organizer tab, and a newly-created event gets a distinct random PIN that
  the old shared PIN does not unlock. Both confirmed directly by Kirt in
  production, not just on a preview deploy.
- **Known, accepted limitation, not fixed here**: `check_event_organizer_pin`
  has no rate limiting or lockout — a script could brute-force a 4-digit PIN
  against a known event id in well under a minute. Same risk class as the
  judge PIN check, which has always worked this way. Worth hardening (e.g.
  an attempt-count column + short lockout) before this handles a client
  whose organizer PIN protects something more sensitive than tally
  visibility, but not done as part of this fix — flagged, not solved.

## Things intentionally NOT built (don't assume otherwise)

- No account system beyond judge PIN + organizer PIN + admin PIN.
- No real-time push (no websockets) — polling only (15s interval in
  `src/main.js`, paused while a judge is on an active scoring card).
- No lock/freeze mechanism for categories after sign-off printing
  (deliberate, confirmed with Kirt).
- No DB-level authorization beyond RLS policies scoped by the event-scoped
  RPCs — see "Client-level data isolation" above for exactly what is and
  isn't enforced at the DB layer now (the RLS lockdown migration is done —
  `events`/`judges`/`categories`/`contestants` are anon-inaccessible
  directly, and the old whole-database RPCs are dropped).
- Per-event organizer PINs shipped 2026-09-24 (see "Per-event organizer
  PIN" above) — no rate limiting/lockout on the PIN check, same as the
  judge PIN, flagged there as an accepted gap, not fixed.

## Copyright / ownership note

Footer and JS header comment: "© 2026 Immortelle Advisory Group. Built by
Kirt Morris, Founder & Principal Consultant." Kirt (via Immortelle Advisory
Group) owns this platform; it was not built as the property of any one
client organization (e.g. WIADCA). Keep this attribution intact in any
future rewrite, including after the Judge D Show rename.
