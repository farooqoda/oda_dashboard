# LinkedIn outreach dashboard

A read-heavy React dashboard over the `gab_leads` and `gab_activity` tables in Supabase.
It replaces the CRM contact-list view that needed horizontal scrolling and truncated every
cell: the table here fits on screen and truncates with tooltips, and the full detail for any
lead is one click away in a modal.

Sending is manual by design. The app copies messages to your clipboard and records what you
did — it never sends anything to LinkedIn.

---

## Setup

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env      # then fill in the two values
npm run dev               # http://localhost:5173
```

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project URL, e.g. `https://abcdefgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon **public** key |

Vite only exposes variables prefixed with `VITE_`, and both of these end up in the browser
bundle. That is safe here only because Row Level Security is on and the anon role is limited
to `SELECT` on `gab_leads` / `gab_activity` and `UPDATE` on `gab_leads`. **Never put a
service-role key in `.env`.** `.env` is gitignored; `.env.example` is the file that is
committed.

Missing configuration is a rendered state, not a crash — the app boots and tells you which
variables are missing.

Other commands:

```bash
npm run build       # typecheck, then production build into dist/
npm run typecheck   # tsc --noEmit
npm run preview     # serve the built output
```

### What the app expects from the database

* `gab_leads` — readable, and updatable on `stage`, `connection_status`, `review_status`.
  Those three are the only columns this app ever writes.
* `gab_activity` — readable, filtered by `linkedin_url` (plus `client_id` when the lead has
  one, since `linkedin_url` is only unique per client).
* `gab_users`, `gab_clients`, `gab_frameworks`, `gab_invite_log` — never touched. They hold
  licence keys and are deliberately locked.

Up to 1,000 rows are fetched per load, newest `created_at` first; paging, filtering, sorting
and every statistic are computed client-side from that set. If the table holds more than
1,000 rows, Settings says so explicitly rather than quietly reporting partial numbers as
totals.

---

## The traits registry

`gab_leads.traits` is a free-form `jsonb` blob written by whichever AI profiling framework
the client is configured with. **Key names vary from row to row**, and new frameworks get
switched on in the database without anyone touching this app. Everything that reads a trait
goes through one file: [`src/lib/traitsRegistry.ts`](src/lib/traitsRegistry.ts).

Three rules, enforced there rather than in each component:

1. A key **in** the registry renders with a human label, in a known group, using a known
   render type.
2. A key **not** in the registry still renders. It lands in the **Other** group on the
   Psychographics tab, with its raw key prettified into a label
   (`enneagram_wing` → "Enneagram wing") and its render type inferred from the value's shape.
3. A key whose value is **empty** — `null`, `undefined`, `""`, `[]`, `{}` — renders nowhere.
   No empty labels, no "undefined" on screen.

### Adding a new framework

Add its keys to `TRAIT_DEFINITIONS`. That is the whole job; every screen picks them up.

```ts
export const TRAIT_DEFINITIONS: Record<string, TraitDefinition> = {
  // …
  attachment_style: {
    label: 'Attachment style',   // shown to the user
    type: 'short',               // how the value is drawn
    group: 'personality',        // which Psychographics section it lands in
    surface: 'psychographics',   // which tab it belongs to
    order: 5,                    // position within the group (lower first)
  },
};
```

| Field | Values |
| --- | --- |
| `type` | `short` · `long` (full text, never truncated) · `score` (0–100 gauge) · `bar` (0–100 inline bar) · `array` (chips) · `bool` (yes/no) · `message` (copyable block) |
| `group` | `personality` · `motivation` · `approach` · `assessment` · `other` |
| `surface` | `psychographics` · `profile` · `outreach` · `meta` — decides which **tab** it appears on, so a trait like `university` shows up in the Profile contact grid instead of the psychographics groups |
| `order` | Sort position inside the group. Unset sorts last. |
| `tone` | `danger` renders array chips in red (used by `risk_flags`) |
| `hint` | Small explanatory line under the label |

**Doing nothing is also valid.** A framework nobody has told the dashboard about still
renders in full under "Other" — that is the point of the design. Adding registry entries only
buys you nicer labels, grouping and a better render type.

Two other things live in that file and are worth knowing about:

* `normaliseFacet()` — Big Five facets have shipped as 0–1, 0–5, 0–10 and 0–100. The scale
  is guessed from the magnitude, and the **raw value is always printed next to the bar** so a
  wrong guess is visible rather than silent.
* `traitsSearchText()` — flattens every value in the blob (nested objects and arrays
  included) into the search haystack, which is why search on the Leads screen covers traits
  the UI has no display rule for.

### Hardcoded vocabularies

The ten ODA buckets and the seven pipeline stages live in
[`src/lib/constants.ts`](src/lib/constants.ts) and are **never derived from the loaded rows**
— that was the flaw in the previous version, where an empty bucket vanished from the filter
list. All ten buckets and all seven stages always appear, with live counts, showing `0` where
none. Values found in the data that are *not* on either list are appended below, greyed, so
nothing is hidden either.

---

## UI areas that depend on data which may be null

Most columns in `gab_leads` are nullable, and older rows predate several profiling fields.
Every place below has a defined behaviour for missing data — none of them renders a blank
panel or the word "undefined".

| Area | Depends on | With no data |
| --- | --- | --- |
| Lead detail → Profile → contact grid | `email`, `phone`, `linkedin_url`, `location`, `company`, plus `website` / `university` / `department_subject` / `linkedin_job_title` from traits | Renders a muted **"Not captured"** — deliberately *not* hidden, so you can tell the field exists and is empty |
| Lead detail → Profile → raw profile text | `profile_text` | Plain sentence explaining the profiling step had nothing to read |
| Lead detail → Psychographics | `traits` | "This lead has not been profiled yet", explaining profiling runs in the database pipeline |
| Lead detail → Outreach | `invite_message`, `linkedin_inmail_subject` / `_message`, reply-draft keys | "No messages have been generated yet". If `response_needed` is `false`, the `response_reason` is shown as a note **instead of** an empty reply box |
| Lead detail → Activity | `gab_activity` rows for the lead's `linkedin_url` | "No activity recorded yet". A lead with no `linkedin_url` gets a note saying activity is keyed by that column |
| Leads table — title, company, bucket, fit, type | `title`, `company`, `traits.oda_bucket`, `traits.fit_score`, `traits.disc_type` | Em dash `—`; full values live in the modal |
| Bucket filter and "Leads by bucket" | `traits.oda_bucket` | Rows without one are counted as **Unbucketed**, listed separately from the ten |
| Personality type filter and chart | `traits.disc_type` | Counted as **No type recorded** |
| Fit score filter, badges, histogram | `traits.fit_score` | Excluded from the histogram. The filter has an explicit "Include leads with no fit score" checkbox, on by default, so narrowing the range never silently drops unscored leads |
| Dashboard "Needs review" and the review filter | `review_status` | Free text, so the test is a case-insensitive match on "need"/"pending"/"unreviewed" rather than an exact string |
| Dashboard week-over-week change | `created_at` | **Omitted entirely** unless there are at least 14 days of history *and* a non-zero prior week — otherwise the comparison is an artefact of when collection started |
| "Leads created over time" | `created_at` | Rows with no usable timestamp are excluded; the card says so when none are usable |
| Stage everywhere | `stage` | Treated as `New Lead`, matching the column default |
| Sorting | any nullable column | Missing values sort **last in both directions** — they are not treated as the lowest value |

---

## What this app deliberately does not do

* **No sending, sequences, campaigns, scheduling or reply tracking.** Nothing in `gab_leads`
  or `gab_activity` records those, and empty shells for them would be worse than their
  absence.
* **No mock data and no seeded demo leads.** If the database is empty, every screen says so
  in plain language.
* **No invented metrics.** Analytics charts only what the data can answer: leads by bucket,
  fit score distribution, leads by stage, leads by personality type, and leads created per
  day. Reply rates and meetings booked are not charted because nothing records them.
* **No prompt configuration.** Frameworks and prompts are managed in the database; Settings
  says so and shows connection status and row counts, read-only.

---

## Project structure

```
src/
  lib/
    traitsRegistry.ts   the jsonb contract — labels, groups, render types, accessors
    constants.ts        the ten buckets, seven stages, page size, fetch limit
    selectors.ts        filtering, sorting, counts, chart aggregation
    supabase.ts         client + the error-to-message mapping (RLS hints live here)
    format.ts           initials, dates, fit bands, pill colours
    csv.ts              export of the current filtered set
  data/LeadsProvider.tsx   one fetch, shared by every screen; optimistic writes with rollback
  components/
    charts.tsx          hand-rolled SVG charts, one accent hue, each with a table view
    modal/              the lead detail modal and its four tabs
  pages/                Dashboard, Leads, Outreach, Analytics, Settings
```

Writes are optimistic: the row updates on screen immediately, and if Supabase rejects the
change the row is rolled back and the real error message is shown inline rather than the UI
claiming a save that did not happen.

### Design notes

Light background, white cards, hairline borders, no gradients or drop shadows, system sans
stack. One accent — deep blue — plus a fixed status palette for fit score (≥ 70 green, 40–69
amber, < 40 red) and red for risk flags. Personality type pills get muted colours assigned by
a stable hash of the type string, so a given type keeps its colour everywhere and across
sessions.

Charts draw a single series in one hue; category identity is carried by axis labels rather
than by colour, and every chart has a "Show table" twin so no value is reachable only by
hovering. Loading uses skeletons rather than spinners, and a background refresh dims the
existing render instead of flashing skeletons over it.
