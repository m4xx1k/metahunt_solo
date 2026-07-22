# First-user concierge cohort

This runbook turns the first 20-user experiment into a repeatable operating
loop. It does not authorize deployment, community posting, direct messages, or
paid traffic. The owner must approve the branch and each outbound channel first.

## Cohort and offer

- Target: 20 Ukrainian Middle/Senior Backend or Full-stack engineers actively
  open to a new role or willing to monitor the market.
- Offer: one role-focused MetaHunt radar that checks public DOU and Djinni
  vacancies and sends new matches to Telegram; no CV is required.
- Exclude: recruiters, junior-only searches, users outside the supported role
  taxonomy, and anyone who did not explicitly agree to receive the test alerts.
- Start with warm, individually contacted people. Do not scrape contacts, buy a
  list, or mass-post into a community without moderator approval.

## Owner setup

Fill these fields before the first invitation:

```text
cohort owner:
support contact:
production URL:
PostHog dashboard URL:
campaign marker:
recruitment channels approved:
start date (UTC):
review date (UTC):
```

Use one bounded campaign marker for the cohort so controlled traffic can be
excluded from acquisition reporting. Keep contact details in a restricted
cohort sheet, never in PostHog event properties or free-form product logs.

## Invitation copy

Personal message in Ukrainian; customize the first sentence truthfully:

> Привіт! Я тестую MetaHunt — радар вакансій для Backend/Full-stack
> розробників. Він перевіряє публічні вакансії DOU і Djinni та надсилає нові
> збіги в Telegram. CV не потрібне. Шукаю 20 людей для короткого тесту: 5 хвилин
> на налаштування, потім оцінити перші 3 алерти. Це безкоштовно; можна зупинити
> будь-коли командою /stop. Хочеш спробувати?

Send the activation link only after an affirmative reply. Do not imply that all
vacancies, perfect relevance, deletion from provider backups, or employment
outcomes are guaranteed.

Follow-up after three delivered vacancies:

> Дякую, що тестуєш MetaHunt. Наскільки релевантними були перші три вакансії за
> шкалою 0–2: 0 — зовсім ні, 1 — частково, 2 — подався/лась би? Що було зайвим
> або чого бракувало? Відповідь можна дати одним повідомленням.

One reminder after 48 hours is the maximum. No reply means stop contacting the
person outside the product's alerts.

## Cohort ledger

Create one row per consenting participant. Use an internal cohort number in the
measurement columns and keep their contact in a separately permissioned column.

| Field | Allowed value |
|---|---|
| `cohort_id` | `C01` through `C20` |
| `consented_at_utc` | timestamp of affirmative reply |
| `source` | bounded approved channel |
| `icp_fit` | `yes` or `no` |
| `landing_at_utc` | timestamp |
| `created_at_utc` | timestamp |
| `linked_at_utc` | timestamp |
| `value_at_utc` | timestamp |
| `first_scheduled_digest_at_utc` | timestamp or `empty` |
| `first_click_at_utc` | timestamp or blank |
| `alert_1`, `alert_2`, `alert_3` | relevance `0`, `1`, or `2` |
| `interviewed` | `yes` or `no` |
| `stopped_at_utc` | timestamp or blank |
| `incident` | bounded category, never message contents |

Do not copy CV text, Telegram IDs, usernames, chat messages, vacancy descriptions,
or free-form interview notes into analytics. Delete the contact column 30 days
after the cohort review unless the person separately opts into future research.

## Daily operating loop

1. Invite no more than five new people per day so support remains manageable.
2. Confirm the landing → created → linked → immediate-value chain in the saved
   funnel without searching by a personal identifier.
3. Check pre-first-delivery empty outcomes and bounded delivery failures.
4. Ask for ratings only after three vacancies or after seven days, whichever
   comes first.
5. Record product incidents immediately and pause new invitations until the
   owner has reviewed them.
6. At the end of each day, record counts invited, accepted, linked, received
   value, clicked, stopped, and needing support.

## Fifteen-minute interview

Ask at least five participants the same core questions:

1. How do you currently notice suitable roles, and what is frustrating about it?
2. What did you expect after linking Telegram? Did MetaHunt do that immediately?
3. For each of the first three alerts, what made it relevant or irrelevant?
4. Which missing filter would most improve the results?
5. Was any part of linking, `/stop`, privacy, or account deletion unclear?
6. Would you keep this radar enabled next month? Why or why not?
7. Who else has this problem strongly enough to test the same workflow?

Capture themes and counts, not a transcript by default. Obtain separate consent
before recording audio or quoting a participant.

## Decision review

Run the review once 20 qualified users have joined or after seven days:

- Continue to the paid-test gate at `landing → linked ≥ 10%`,
  `created → linked ≥ 60%`, `linked → value ≥ 80%`, at least 30% of linked users
  clicking a vacancy within seven days, and no privacy/support incident.
- Iterate the offer or onboarding when activation is healthy but fewer than six
  of the 20 users receive a relevant vacancy within 24 hours.
- Review filters/ranking before acquisition when more than 30% of rated first
  alerts score `0`.
- Stop acquisition below 5% landing → linked, on any privacy incident, or when
  the first ten linked users produce zero vacancy clicks.

Report raw denominators alongside every percentage. A participant who never
receives three alerts remains in activation and empty-result counts; do not drop
them from the cohort to improve the relevance score.

## Related runbooks

- Funnel views and deployment verification: [`first-user-funnel.md`](first-user-funnel.md)
- Account deletion and retention: [`account-deletion.md`](account-deletion.md)
- CV data boundary: [`cv-privacy.md`](cv-privacy.md)
