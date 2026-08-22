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
bundle. That is safe here only because Row Level Security is on and the anon key grants
nothing on its own — every data query runs under the signed-in user's own JWT, and RLS scopes
it to their client. **Never put a service-role key in `.env`.** `.env` is gitignored;
`.env.example` is the file that is committed.

Missing configuration is a rendered state, not a crash — the app boots and tells you which
variables are missing.

Other commands:

```bash
npm run build       # typecheck, then production build into dist/
npm run typecheck   # tsc --noEmit
npm run preview     # serve the built output
```

## Authentication

Each person signs in with their own Supabase Auth account. There is no shared key and **no
client filter anywhere in the app** — isolation is entirely RLS's job, scoping every query
to whichever client the signed-in user belongs to.

```
Sign up (email + password + invite code)
    └─ auth.signUp
         ├─ session returned  → redeem invite immediately → dashboard
         └─ no session        → park the code, ask the user to confirm their email
                                  └─ redeemed automatically on first sign-in

Sign in (email + password)
    └─ read the user's own row in gab_user_clients → client_id → dashboard
         └─ no row → "Link your account" screen (enter an invite code)
```

Nothing behind the gate **mounts** before there is a session, not merely nothing renders:
`LeadsProvider` fetches on mount, so mounting it early would fire queries with no JWT and
show a spurious RLS error before the login form had even appeared.

### The licence key handoff

Redeeming an invite lands the user on a one-time **Setup complete** screen showing the
`license_key` from their own `gab_users` row, with a Copy button. All three redemption paths
route through it — signup with a session, a parked code redeemed on first sign-in, and the
"Link your account" recovery screen — so the key is never skipped.

That key is the credential for the **LinkedIn extension**, paired with the same email. It is
not the dashboard password, and the dashboard password is not it; the screen says so, because
having two credentials for one account is exactly the kind of thing users conflate. It is
shown once here, and repeated only on Settings, where the user can recover it later.

The row is generated server-side and may not exist the instant `signUp` resolves, so a
missing row is retried with backoff before being reported. An RLS refusal is **not** retried —
it will not fix itself. If the key cannot be read for any reason the account still works and
the screen says so, pointing at support, rather than blocking the user behind a value they
do not strictly need to use the dashboard.

**Settings shows the key too.** Users lose it, and "sign up again" is not a recovery path, so
Settings reads the same `gab_users` row (`user_id = auth.uid()`) and renders the key in the
same copyable block, alongside the `email` recorded on that row — which is null on older
accounts and shows as "Not set" rather than breaking the panel.

When that read comes back empty, Settings says **why**, on screen: the query it ran, the user
id it ran it for, and either the verbatim Postgres error with its code or the fact that it
matched no rows — plus the `gab_users` policy that would fix it. A licence key that silently
does not appear is unsupportable, so this is the one place Settings shows a raw error. The
read also falls back to an `id`-keyed `gab_users` if `user_id` does not exist (Postgres
42703), because that is a schema difference rather than a missing key.

### Supabase project settings

* Enable the **Email** provider under Authentication → Providers.
* Either setting for **Confirm email** works. With it off, signup redeems the invite straight
  away. With it on, `signUp` returns a user but no session — there is no JWT to write with —
  so the code is parked in `localStorage` and redeemed on first sign-in. The signup screen
  says so explicitly rather than appearing to lose the code.

### Tables used for access control

These two were not part of the original data model, so the **column names below are
assumptions**. They are collected in `AUTH_TABLES` / `AUTH_COLUMNS` at the top of
[`src/lib/auth.ts`](src/lib/auth.ts) — correct them there if yours differ.

| Table | Columns this app uses |
| --- | --- |
| `gab_client_invites` | `code`, `client_id`, and a "spent" marker |
| `gab_user_clients` | `user_id` (auth uuid), `client_id` |

The "spent" marker is **detected at runtime** rather than assumed, because both common
conventions exist. A boolean (`used`, `is_used`, `redeemed`, `is_redeemed`) or a nullable
timestamp (`used_at`, `redeemed_at`, `claimed_at`, `used_on`) all work, and `used_by` /
`redeemed_by` are populated only if the table actually has them. If none of those columns
exist the invite still grants access, but nothing marks it spent — so it stays reusable.

Minimum policies:

```sql
-- A user may read their own link row (this is how the app resolves client_id).
create policy "read own client link" on gab_user_clients
  for select using (user_id = auth.uid());

-- A user may create their own link row during redemption.
create policy "create own client link" on gab_user_clients
  for insert with check (user_id = auth.uid());

-- Authenticated users may read and spend invite codes.
create policy "read invites" on gab_client_invites
  for select to authenticated using (true);
create policy "spend invites" on gab_client_invites
  for update to authenticated using (used = false);

-- Leads and activity are scoped by client membership.
create policy "leads for my client" on gab_leads
  for select using (
    client_id in (select client_id from gab_user_clients where user_id = auth.uid())
  );
```

### Security note — read this before going live

**Invite redemption runs in the browser, under the user's own JWT, because that is what the
requested flow implies.** That puts a hard ceiling on what it can guarantee. For the flow to
work at all, an authenticated user must be able to `insert` into `gab_user_clients` and
`update` `gab_client_invites` — and anyone who can do that from the app can do it from a
console, inserting a row for **any** `client_id` and reading that tenant's leads. No amount
of client-side care closes that hole; the checks in `redeemInvite` are honest about being
usability guarantees, not security ones.

What the code does do is remove the check-then-act race: the invite is validated first (so
the error can distinguish "not recognised" from "already used"), but it is *claimed* with a
single conditional `UPDATE` that only matches while the invite is unspent. If that update
matches zero rows, someone else won the race and the link row inserted a moment earlier is
deleted again.

The durable fix is to move redemption server-side and drop the direct write policies:

```sql
create or replace function redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_client_id text;
begin
  update gab_client_invites
     set used = true, used_by = auth.uid(), used_at = now()
   where code = p_code and used = false
  returning client_id into v_client_id;

  if v_client_id is null then
    raise exception 'invalid_or_used_invite';
  end if;

  insert into gab_user_clients (user_id, client_id)
  values (auth.uid(), v_client_id)
  on conflict do nothing;

  return v_client_id;
end;
$$;
```

With that in place, `redeemInvite` becomes a single `supabase.rpc('redeem_invite', { p_code })`
call, and `gab_user_clients` needs no insert policy at all. **I have not made that change,
because it is a database migration rather than app code and you did not ask for one.**

### What the app expects from the database

* `gab_leads` — readable, and updatable on `stage`, `connection_status`, `review_status`,
  `conversation_history` and `reply_draft`. Those five are the only columns this app ever
  writes. The last two back the Outreach tab's conversation box: `conversation_history` holds
  the LinkedIn thread the user pasted, `reply_draft` the reply drafted from it.
  Realtime must be enabled on this table (`alter publication supabase_realtime add table
  gab_leads;`) for new leads to appear without a refresh; without it the dashboard still
  works, it just goes stale between manual refreshes.
* `gab_activity` — readable, filtered by `linkedin_url` (plus `client_id` when the lead has
  one, since `linkedin_url` is only unique per client).
* `gab_client_invites`, `gab_user_clients` — touched only during sign up and sign in, to
  resolve which client an account belongs to.
* `gab_users` — the signed-in user reads **their own row only**, for `license_key` and
  `email` (Setup complete and Settings). Requires a policy such as
  `create policy "read own user row" on gab_users for select using (user_id = auth.uid());`
  The whole row is selected rather than named columns, so a deployment without an `email`
  column still gets its licence key instead of failing the query outright.
* `gab_clients`, `gab_frameworks`, `gab_invite_log` — never touched, and deliberately
  locked.

Up to 1,000 rows are fetched per load, newest `created_at` first; paging, filtering, sorting
and every statistic are computed client-side from that set. If the table holds more than
1,000 rows, Settings says so explicitly rather than quietly reporting partial numbers as
totals.

### Staying live without flickering

Leads arrive on their own, and the app is judged on whether that feels calm. Two things make
it so, and both were bugs first.

**Realtime lands as a diff, not a reload.** A change event is applied to the row it names:
an update replaces that one row in place, an insert is spliced into its sorted position, a
delete removes it. Rows that did not change keep their exact object identity, and when a
refetch turns out to be equivalent the array itself is kept — so React re-renders nothing,
the list does not flash and the scroll position survives. Payloads carry only what the
table's replica identity exposes, so an incoming row is merged over the known one, never
substituted for it. Behind that, a debounced *silent* reconcile (no "Refreshing…" state, no
dimmed panels) refetches to cover dropped events and reconnects. The previous version
refetched everything on every event and replaced the whole array, which is what made the
list flash.

**A token refresh is not a sign-out.** `autoRefreshToken` fires an auth event roughly hourly,
and again on tab focus. Those carry the same user with a new JWT. Treating them as a new
sign-in re-ran the client lookup, dropped `status` to `loading`, unmounted everything behind
the gate — `LeadsProvider` included — and flashed the boot screen mid-session. Now the
*identity of the user* is what invalidates the link, so a refresh changes nothing on screen,
and a known `client_id` outranks any in-flight re-check in `status`, so a background check
can never demote a working dashboard back to loading.

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
| Sign in → client resolution | the user's row in `gab_user_clients` | No row is a distinct state from a failed query: no row shows the "Link your account" screen, a failed query shows the real Supabase error |
| Every screen, signed out | — | Redirected to Login. No dashboard content renders, and no lead query is issued |

---

## Settings, and where errors show up

Settings carries no backend branding: no vendor name, no project URL or hostname, no mention
of the database engine or of API keys. It shows a generic system status, the signed-in email,
the email on the account row, the client, the account's total lead count, the LinkedIn
extension key with a Copy button, a support address, and a Log out button.

That makes it the **one screen that does not surface raw query errors** — a failure there is
reported as "System status: Unavailable" with a route to a human. Every other screen still
shows the real message with the RLS hint, because those are working surfaces where diagnosing
a failure is the point. The support address is `SUPPORT_EMAIL` in
[`src/lib/constants.ts`](src/lib/constants.ts) — change it to an address your team monitors.

## Drafting a reply from a conversation

The Outreach tab's **reply-draft area is extended, not replaced**. The box that shows a
drafted reply — and its "no reply drafted" fallback, whose text comes from the row's
`response_reason` — is the one that has always been there. What is new sits directly above
it: a textarea and a Draft Reply button, whose result lands in that same box. There is
deliberately no second reply-draft display.

This app cannot read LinkedIn, so the user pastes the thread — both sides — into the
textarea. It saves to `gab_leads.conversation_history` on blur, on an explicit **Save**, and
again before drafting; typing is never lost by navigating away, and a change to the row from
elsewhere only overwrites the box when there is nothing unsaved in it.

**Draft Reply** POSTs to the n8n workflow at `DRAFT_REPLY_WEBHOOK`
([`src/lib/constants.ts`](src/lib/constants.ts)):

```jsonc
// →
{ "lead_id": 123, "client_id": "…", "conversation_text": "…" }
// ←
{ "reply_draft": "…" }
```

The draft is shown read-only with a Copy button, in the existing reply-draft box, and
written back to `gab_leads.reply_draft` so it is still there next session — that value is
also read when the modal opens, so a draft from a previous session or from the pipeline
shows up without anyone pressing the button. The response is parsed defensively: a bare object, a
single-element array, an `{ output }` / `{ json }` wrapper or plain text all work, because
which one you get depends on how the workflow's final node is configured. Nothing is sent
to LinkedIn; as everywhere else in this app, the user copies and sends by hand.

This is the only outbound request the dashboard makes to anything other than Supabase.

### Where a message lives

The invite, the InMail subject and body, and the reply draft are read from **the column if
there is one, and from `traits` if there is not** — `select('*')` returns whatever columns
the table actually has, so both are checked, column first. Different pipelines have written
these to different places, and keying the display off only one of them meant an InMail that
existed did not render. `messageText()` in
[`OutreachTab.tsx`](src/components/modal/OutreachTab.tsx) is the single place that decides.

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
    draftReply.ts       the one non-Supabase call: conversation in, reply draft out
    format.ts           initials, dates, fit bands, pill colours
    csv.ts              export of the current filtered set
    auth.ts             invite redemption, licence key, auth errors, table/column assumptions
  data/
    AuthProvider.tsx    session, client_id, sign in / sign up / sign out
    LeadsProvider.tsx   one fetch, shared by every screen; realtime applied as a diff,
                        optimistic writes with rollback
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
