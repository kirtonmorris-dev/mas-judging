# Judge D Show (formerly "Carnival Judging") — Project Context

This file exists so any future Claude Code session (or human) picking up this
project has the background needed to work on it safely. Read this before
making changes. It reflects the state as of 2026-09-21 — if things look
different, trust the code over this file and update this file.

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

**Branding**: the app was renamed from "Carnival Judging" to **"Judge D
Show"** (domain `judgedshow.com`, defensive alt `judgedeshow.com`). The
rename is applied throughout user-facing text and code comments/doc
references (`index.html`, `README.md`, `src/main.js` header comment,
`scripts/stress-test.mjs` comment, this file). Domain purchase and the
background-visual redesign are still open — see "Pending business/marketing
items" below.

## Architecture

- **Modular vanilla JS, ES modules**, no build step, no framework, no
  bundler. Entry point `index.html` loads `src/main.js` as `type="module"`.
  Source is organized under `src/`: `api.js` (all Supabase I/O), `state.js`
  (single mutable state object), `views/` (judge.js, organizer.js, setup.js,
  tally.js, judgeDetail.js, shared.js), `utils.js`, `constants.js`,
  `competitionLibrary.js`, `historicalLoaders.js`, `importParsers.js`,
  `print.js`, `ui.js`.
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

## Deployment

- **Hosting**: Vercel, project `mas-judging`, team `kirt-morris-projects`.
- **Live URL**: https://mas-judging-kirt-morris-projects.vercel.app
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
`events`, `judges`, `categories`, `contestants`, `scores`, `score_history`,
`config_meta`. Key points:

- **`scores`** has a composite primary key
  `(event_id, category_id, contestant_id, judge_slot)`. Every judge
  submission is a single-row `INSERT ... ON CONFLICT DO UPDATE` (upsert),
  done via `src/api.js`'s `saveScoreEntry`/`saveOrganizerScoreEdit`/
  `saveScoresMerge`. **This is what fixed a real production bug**: the old
  blob model let a judge's stale in-memory copy silently overwrite another
  judge's newer submission under concurrent load. The new model makes that
  structurally impossible — verified by direct concurrency testing (see
  `scripts/stress-test.mjs`) and confirmed working live by the user.
- **Config (events/judges/categories/contestants) writes** go through a
  `replace_config(p_events, p_expected_rev)` Postgres RPC function that
  atomically replaces the whole event tree in one transaction, preserving
  the old "organizer edits the whole in-memory tree, then saves it all at
  once" pattern the UI relies on, but with a real optimistic-concurrency
  check (`config_meta.rev`) enforced server-side instead of racily in JS.
  Reads go through a matching `get_config()` RPC that reconstructs the
  exact nested JSON shape the JS layer expects (camelCase keys etc.) in one
  round trip.
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
- **Anon key security model unchanged from the old blob table**: full
  public read/write, no DB-level auth. PIN gates are app-only. This is a
  known, accepted tradeoff, not an oversight — revisit only if explicitly asked.

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
2. **Feedback & error states** (`src/api.js`, `src/ui.js`, `index.html`):
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

Organizer PIN: `2026` (`ORG_PIN` in `src/constants.js`, not in Supabase).

## Things intentionally NOT built (don't assume otherwise)

- No account system beyond judge PIN + organizer PIN.
- No real-time push (no websockets) — polling only (15s interval in
  `src/main.js`, paused while a judge is on an active scoring card).
- No lock/freeze mechanism for categories after sign-off printing
  (deliberate, confirmed with Kirt).
- No DB-level authorization beyond RLS policies that mirror "anyone with
  the anon key can do anything" — security is app-level PIN gates only.

## Copyright / ownership note

Footer and JS header comment: "© 2026 Immortelle Advisory Group. Built by
Kirt Morris, Founder & Principal Consultant." Kirt (via Immortelle Advisory
Group) owns this platform; it was not built as the property of any one
client organization (e.g. WIADCA). Keep this attribution intact in any
future rewrite, including after the Judge D Show rename.
