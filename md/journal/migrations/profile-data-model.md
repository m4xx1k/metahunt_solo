# profile — candidate knowledge model

**Status:** design prototype — strong, not yet implemented. Talked through
across three sessions (data model + migration + stage split); nothing has
shipped, no code written. `profile` is `ARCHITECTURE.md`'s partial module and
its own metric (completion rate) has no boundary to compute against yet.
**Sits atop:** reverse-ats (candidates.extracted / candidate_nodes), MET-149,
MET-50, MET-103 (canceled — its onboarding assumed CV↔subscription coupling
this doc removes).
**Date:** 2026-09-07

## Problem

Three entities exist in the product and their boundaries are wrong:

- **subscription** = a saved set of hard filters + a Telegram delivery target.
- **CV** = today's easiest way in (upload → see a matched feed), but also the
  place where a candidate can add skills a CV doesn't mention (a PhD, an
  unlisted stack). Those manual additions currently write into the CV's own
  row — global, content-hashed, shared across accounts if two people upload
  the same file.
- **profile** = doesn't exist. `candidates.extracted` only holds
  `role/seniority/englishLevel/experienceYears/skills` — no name, contacts,
  about, experience, projects, education, certificates.

Two concrete failures this causes:

1. A subscription can hold a `candidate_id` — coupling a recurring digest to
   one immutable document. Re-upload a CV, get a different specialization
   (Max's own case: fullstack CV vs backend CV vs a hypothetical AI/mobile/
   devops one) and the subscription has no story for what changes.
2. Manual skill edits (`rejectSuggestion`, additional-skills accept/reject)
   write into `candidates.extracted`, a row keyed only by content hash — not
   owner-scoped despite a comment claiming it is. Two accounts uploading an
   identical file would share edits. Hasn't happened yet (checked prod: 0
   collisions) but the schema doesn't prevent it.

## Decisions made

**Subscriptions are not resume-based.** Prod data confirms this isn't a
theoretical call: of 34 active subscriptions, 30 are pure filters and only 3
carry a `candidate_id`. Subscriptions stay a hard-filter query; the only link
to profile is a `fit_mode` flag (`off` → today's behavior; `rank` → same
vacancies, sorted + annotated with gaps; `filter` → threshold cutoff, later).
No document reference on the subscription row at all.

**One profile per person, not one per specialization.** Max's multi-CV case
(fullstack / backend / could-make an AI-engineer or React-Native one) is not
multiple people — it's one person with multiple *intents*. The profile is the
union of everything ever seen about them; a backend CV not mentioning React
doesn't erase React. What differs between two of Max's CVs is the *target*
(track + filters), not the *person*. So: one profile, N documents, N
subscriptions — no per-specialization profile variant, no versioning. (Selling
more CVs/targets later as a paid tier is still open — not blocked by this.)

**Skills are the only field that earns a table.** They're the only thing that
gets filtered/joined against the 18k-vacancy catalog. Everything else
(role, seniority, english, experience-years, and later name/contacts/
about/experience/projects/education/certificates) is display+edit only, never
joined — so it's `jsonb`, one validated shape, normalized on read via a
version tag. A field only "graduates" out of jsonb into its own column the
moment something needs to filter or join on it.

**No provenance/override journal.** First pass modeled edits as an operation
log (`add`/`remove` ops layered over a base) — rejected as over-engineered:
reconstructing truth meant replaying history. Replaced with one `origin`
column per skill row (`cv` / `user` / `excluded`). Truth is a direct `SELECT`.

## Data model

```
cv_documents            one row = one uploaded file, immutable
  id, user_id (nullable), label, source_text, parsed jsonb,
  content_hash, created_at
  unique(user_id, content_hash)   ← actually owner-scoped, unlike today

profiles                one row = one person
  user_id PK, data jsonb, schema_version int, updated_at

profile_skills          one row = one skill the person has
  user_id, node_id, origin 'cv' | 'user' | 'excluded'
  PK(user_id, node_id)

subscriptions           unchanged shape, minus candidate_id, plus fit_mode
  user_id, params jsonb (hard filters), fit_mode, chat_id, ...
```

`candidates` / `candidate_nodes` / `user_cvs` (today's tables) are replaced by
the above for real users. `candidates` survives only for the 5 `type='sample'`
rows the reverse-ATS picker ranks against (not people — no profile needed);
those can move into seeds outright.

### Where do skills live — both places, different questions

| table | answers | read by |
|---|---|---|
| `cv_documents.parsed.skills` | what that one file said | nobody but history / future cv-builder |
| `profile_skills` | what the person actually has | **the only one match reads** |

The first is a frozen fact about a document. The second is the live working
set. Matching never looks at a document.

### `profiles.data` shape (grows without migrations)

```jsonc
{
  "v": 1,
  "role": "Fullstack Engineer",
  "seniority": "MIDDLE",
  "englishLevel": "UPPER",
  "experienceYears": 3
  // stage 3, no schema change needed:
  // "name", "contacts", "experience": [...], "projects": [...],
  // "education": [...], "certificates": [...]
}
```

Schema drift is contained by three rules, not by structure:

1. One zod type, one write path — every writer goes through the same
   validated function.
2. `v` travels inside the object; a read normalizes an old shape to current on
   the way out.
3. A field only leaves jsonb for a column when something needs to filter or
   join on it (skills already did).

### Re-upload logic (no merge UI, no conflict prompts)

- **Skills:** union across all of the user's `cv_documents`. Insert new
  `origin='cv'` rows, delete `origin='cv'` rows no longer present in *any*
  document. Rows with `origin='user'` or `'excluded'` are never touched.
- **`profiles.data` scalars:** diffed against the newest document's parse (a
  handful of fields — role/seniority/english/years) and shown as a plain
  pre-filled "update?" prompt. Small enough that a merge engine is overkill.

This directly answers "what happens when I upload an updated resume, possibly
in a different specialization": nothing is overwritten, nothing is asked
about the skill list, and the profile only grows.

## Prod snapshot (checked 2026-09-07, local restore of the 2026-09-05 backup)

| | |
|---|---|
| users | 31 |
| users who uploaded a CV | 15 (22 `user_cvs` links, 35 parsed documents) |
| CVs per user | 11×1, 3×2, 1×5 |
| orphaned documents (never claimed by a login) | 13 / 35 (37%) |
| active subscriptions | 34 |
| — pure filter | 30 |
| — CV-linked | 3 |
| users with both a CV and an active subscription | 4 |
| `is_active` double-set on `user_cvs` (bug: no partial unique index) | 3 users |
| total `source_text` across all CVs | 86 kB (avg 2.5k chars, max 28k) |
| `candidates.extracted` fields actually populated | role, seniority, englishLevel, experienceYears, skills, unmatchedSkills (+ 2 rows with rejectedSkillIds) |

No file storage exists today — `extractText` runs once at upload and only
`source_text` (plain column) is kept. Migrating 86 kB of text needs no asset
handling, just row copies.

### Migration (single transaction, no user-visible change)

```
cv_documents   ← candidates where type='user'         (35 rows)
                 user_id from user_cvs, else NULL       (13 orphans)
profiles       ← parsed data of each user's active CV   (15 rows)
profile_skills ← union of candidate_nodes across a user's documents, origin='cv'
                 + rejectedSkillIds → origin='excluded'  (2 rows)
subscriptions  ← candidate_id != null → fit_mode='rank', else 'off'
                 drop candidate_id column
candidates     ← keep only type='sample' (5 rows), or move to seeds
```

Add the partial unique index this migration would need anyway
(`profiles.user_id` / one active CV) so the "2 active CVs" bug can't recur.

## Open question — not decided

**Anonymous upload.** 13 of 35 documents (37%) are never claimed. Two ways to
close this, not yet chosen:
- claim-at-login + a TTL that deletes unclaimed documents, or
- require login before upload (cleaner data, costs some wow-moment
  conversion — unmeasured how much).

## Stages

1. **Split the tables + migrate.** No new user-facing feature. Ships the
   model above, retires `candidate_id` on subscriptions, moves manual skill
   edits out of the shared `candidates` row into `profile_skills`. Fixes the
   cross-account edit risk and the onboarding-doesn't-persist bug even before
   stage 2 has a UI.
2. **`/profile` as a screen.** Edit view, re-upload union logic live,
   `fit_mode='rank'` surfaces % + gaps in a subscription. This is where the
   value becomes visible to a user.
3. **Full extraction.** Widen the BAML extractor to name/contacts/about/
   experience/projects/education/certificates. Unlocks `pack` (custom CV =
   profile × target — both already exist by stage 2) and a cv-builder/
   bullet-quality advisor. Can't start earlier — there's nothing to build it
   against.
