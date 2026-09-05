# Mas Judging — Project Context

This file exists so any future Claude Code session (or human) picking up this
project has the background needed to work on it safely. Read this before
making changes.

## What this is

A live carnival judging app used by Immortelle Advisory Group (Kirt Morris)
to run digital scoring for carnival/mas competitions (Baltimore One Carnival,
WIADCA Junior Carnival, and future events). Judges score contestants on their
phones in real time; organizers watch results come in on a live tally and
print official sign-off sheets at the end.

## Architecture

- **Single file app**: everything — HTML, CSS, and JavaScript — lives in one
  file, `index.html`. No build step, no framework, no bundler. Vanilla JS
  with template-literal string rendering (`innerHTML` replacement), not
  React/Vue/etc.
- **External library**: SheetJS (xlsx), loaded from a CDN
  (`cdnjs.cloudflare.com`), used for reading uploaded Excel files.
- **Fonts**: Google Fonts (Bebas Neue + Inter), loaded from a CDN.
- **No server-side code.** All logic runs in the browser. Data persistence
  goes straight from the browser to Supabase's REST API.

## Deployment

- **Hosting**: Vercel. Project name `mas-judging`, under team
  `kirt-morris-projects` (team ID `team_gBKSkiadvJWuIVJzASOCRDA2`).
- **Live URL**: https://mas-judging-kirt-morris-projects.vercel.app
- **How deploys have happened so far**: manually, by uploading the full
  `index.html` file straight to Vercel through Claude's Vercel integration.
  There is **no GitHub → Vercel auto-deploy wired up yet**. This GitHub repo
  (`kirtonmorris-dev/mas-judging`) currently exists as a backup/source-of-truth
  copy, not as the deploy trigger. If you want git-push-to-deploy, you'll need
  to link this repo to the Vercel project (Vercel dashboard → Project →
  Settings → Git, or ask Claude to do it if it has Vercel access).
- **Deployment Protection**: Vercel's own "Vercel Authentication" gate was
  previously ON for this project and had to be manually turned off in Vercel
  project settings (Settings → Deployment Protection), since it was blocking
  judges from reaching the app without a Vercel login. If the app is ever
  unreachable for users again, check this setting first.

## Database (Supabase)

- **Project URL**: `https://pjqojhtqxljnukwlzekr.supabase.co`
- **Anon/publishable key** (already embedded in the deployed app, not a new
  secret): `sb_publishable_ahi2YrsAURh98_DGfM1Hfw_sRw9T34B`
- **Table**: `mas_judging_data` — just two columns: `id` (text, primary key)
  and `data` (jsonb). It's used as a simple key-value store with three rows
  currently in use:
  - `id = 'config'` → the entire events/judges/categories/contestants tree
  - `id = 'scores'` → all submitted scores, keyed by a composite string
  - `id = 'scores_history'` → a rolling array of the last 10 full snapshots
    of the scores row, used as a safety net (see "Score-saving safety" below)
- **Access pattern**: the app reads/writes via plain `fetch()` calls to
  Supabase's PostgREST endpoint (`/rest/v1/mas_judging_data`), not the
  Supabase JS SDK. See `sbGet()` / `sbSet()` near the top of the script.

### ⚠️ Network access check

Some sandboxed tool environments (including the one used to build most of
this app) **cannot reach `supabase.co` or `github.com` directly** — only a
fixed allowlist of domains. If you're working in a similarly sandboxed
Claude Code environment, check early whether you can actually `fetch()` or
`curl` the Supabase URL above and push to GitHub. If not, you may need to:
- Ask the human to run git push commands themselves, or
- Work around it the way this project has been: build/edit the file locally,
  then hand off the deploy step to whatever tool *does* have Vercel access.

## Data model

```
config row:
{
  events: [{
    id, name,
    judges: [{ name, realName, pin }],   // see "Judge blinding" below
    categories: [{
      id, name,
      entryType: 'individual' | 'group',
      criteria: [{ key, label, max }],
      contestants: [{
        id, band, masquerader, portrayal,
        assignedJudges: [judgeName, ...]  // judgeName = the masked name
      }]
    }]
  }]
}

scores row:
{
  "<eventId>|<categoryId>|<contestantId>|<judgeName>": {
    [criterionKey]: number, ...,
    judge, event, category, contestant, submittedAt,
    totalOnly: true   // optional flag — see "Historical data" below
  }
}
```

- **entryType: 'individual'** → contestant identified by Band + Masquerader +
  Portrayal (e.g. Queen/King categories).
- **entryType: 'group'** → contestant identified by Band + Portrayal only, no
  masquerader field (band/steelband-style categories).
- Each category has its own independent criteria list (labels + point
  maximums) — different categories in the same event can have completely
  different judging rubrics.

## Judge blinding (masked names)

Judges are represented two ways:
- `name` — the masked label ("Judge 1", "Judge 2", ...), used as the
  **internal identifier** everywhere: `assignedJudges` arrays, score keys,
  Live Tally, Judge Detail, print sheets, and the Judge tab's judge-picker.
- `realName` — the organizer-entered real name, shown **only** in
  Organizer → Setup, next to the masked label, so the organizer can keep
  track of who's who.

Judges do **not** self-register anymore. The organizer adds each judge by
real name in Setup; the app auto-assigns the next available "Judge N" label
(based on the highest existing number + 1, so removed judges' numbers aren't
silently reused). Judges then pick their pre-assigned "Judge N" slot from a
dropdown on the Judge tab and set a 4-digit PIN the first time they use it.

**Do not reintroduce a flow where judges type in their own name on the Judge
tab** — that was the original design and was deliberately removed because it
let every judge see every other judge's real name in a shared dropdown,
defeating the blinding.

## Score-saving safety (read this before touching score-submission code)

Early on, there was a real bug: submitting a score uploaded the *entire*
local copy of all scores, overwriting the whole `scores` row in Supabase. If
Judge A's tab had been open for a while (common — judges keep the scoring
screen open for many contestants at a stretch) and Judge B submitted
something in the meantime, Judge A's next submission would silently erase
Judge B's newer score, since it was replacing the whole dataset with a stale
snapshot.

**Fixed by `saveScoreEntry(key, entry)`**: before every score submission, it
re-fetches the current `scores` row fresh from Supabase, merges in just the
one changed entry, and writes that back — never the judge's own possibly-
stale in-memory copy. This is the only path that should ever be used to save
an individual score. Don't revert to `state.scores[key] = ...; saveScores()`
for judge-submitted scores.

A rolling history (`scores_history`, last 10 snapshots) is written after
every successful score save, purely as a recovery safety net — not read by
the app during normal operation.

Live Tally and Judge Detail auto-refresh from Supabase every 15 seconds
while the organizer is viewing them. The Judge tab also refreshes every 15
seconds while a judge is browsing their contestant list, but **not** while
they're actively on a scoring card (to avoid interrupting typing/mid-edit
state). See the `setInterval` near the bottom of the script.

## Print flows

Three separate print outputs exist, all rendered into a hidden
`#printArea` div and triggered via `window.print()`, with their own
`@media print` CSS (clean black-on-white, no app chrome):

1. **Blank scoring sheets** (Setup) — one page per judge per category
   they're assigned to, for paper backup scoring.
2. **"Print my scores"** (Judge tab) — a judge's own record of what they've
   submitted in the current category.
3. **Sign-off sheet** (Live Tally) — matches the live tally's columns, plus
   a signature line per judge and a "Judges Coordinator" line, for the
   traditional end-of-event paper sign-off. This does **not** lock the
   category from further edits — it's a point-in-time snapshot only.

## Workbook import (multi-sheet Excel upload)

Setup has two import tools:
1. **Single-category import** — pick an existing/new category, upload a
   simple sheet with Band/Masquerader/Portrayal columns starting on row 1.
2. **Full workbook import** — upload a multi-tab workbook (e.g. a full
   judging packet with one tab per category). For a chosen tab, the app:
   - **Auto-detects the header row** even with title rows above it
     (`detectHeaderRowIndex`) — it looks for a row containing "band" with at
     least 4 non-blank cells, specifically to avoid false-matching on a
     title like "Junior Band Large" (which contains "Band" but is a
     single-cell title row, not a header row).
   - **Auto-detects Individual vs Group** based on whether a Masquerader-ish
     column exists.
   - **Auto-parses criteria + point values** straight from header text like
     `"Color & Impact 30"` → label "Color & Impact", max 30
     (`parseCriterionHeader`).
   - Creates (or reuses, by exact name match) a category named after the
     sheet tab.

## One-time admin data loaders

Two buttons in Setup exist purely to backfill specific historical
spreadsheets into the live app. They're not general-purpose and shouldn't be
used as a template for new events without adjustment:
- `loadBaltimoreHistorical()` — Baltimore One Carnival 2026 data.
- `loadWIADCAJuniorData()` — WIADCA Junior Carnival data. Notably, this one
  operates on **whichever event is currently selected** in the dropdown
  (not a hardcoded event ID), since the exact live event name wasn't known
  with certainty when it was built.

## Organizer access

- **Organizer PIN**: `2026` (hardcoded as `ORG_PIN` near the top of the
  script — not stored in Supabase).

## Things intentionally NOT built (don't assume otherwise)

- No account system / login beyond the judge PIN + organizer PIN.
- No real-time push updates (no websockets) — everything is polling-based
  (`setInterval`, 15s).
- No undo UI for the `scores_history` backups — they exist as a raw
  Supabase row for manual recovery only, not surfaced anywhere in the app.
- No lock/freeze mechanism for categories after sign-off printing (this was
  a deliberate choice, confirmed with Kirt).

## Copyright / ownership note

Footer text and a JS comment both read: "© 2026 Immortelle Advisory Group.
Built by Kirt Morris, Founder & Principal Consultant." Kirt (via Immortelle
Advisory Group) owns this platform; it was not built as the property of any
one client organization (e.g. Alyene English's carnival committee, or
WIADCA). Keep this attribution intact in any future rewrite.
