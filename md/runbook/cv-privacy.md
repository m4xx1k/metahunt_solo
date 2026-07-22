# Runbook - CV Privacy Boundary

## Approved policy

- A Telegram-authenticated account is required before a CV upload.
- Raw CV text is processed in memory and is not persisted after extraction.
- Every user-uploaded candidate belongs to one account; its content hash is
  owner-scoped, not globally deduplicated.
- User CV reads, matches, recommendations and skill mutations require both a
  valid JWT and an ownership check. Seeded samples are the only public CV data.
- Deleting an account CV deletes its candidate, derived skills and CV-based
  subscriptions when that account is the final owner.
- Deleting the account also removes its Telegram identities, owned and
  same-chat subscriptions, notification history, and every final-owner
  candidate. See [`account-deletion.md`](account-deletion.md).
- A CV-based Telegram subscription is created with an authenticated owner and
  can be activated only by that owner's Telegram private chat.

## Legacy compatibility

`candidates.source_text` remains a non-null database column until a separate
migration is reviewed. New uploads write an empty string, never CV content.
Do not add a migration or backfill as part of this branch. The follow-up
migration should remove the column or make it nullable after production data
retention has been explicitly reviewed.

Legacy unowned CV subscriptions are intentionally not activated. A user must
create a new owner-bound subscription after signing in.

Legacy candidates with more than one `user_cvs` owner link are inaccessible to
the CV API and cannot receive CV digests. They require manual retention review
or a user re-upload; this branch does not migrate or inspect production CV data.

## Verification

- `POST /cv` without a Bearer token returns `401`.
- A user cannot read or mutate another user's candidate UUID; return `404` to
  avoid confirming its existence.
- `POST /subscriptions` rejects a `candidateId`; use authenticated
  `POST /subscriptions/cv`.
- A forwarded CV deep link must not activate for a different Telegram chat.
- Deleting `/me/cv/:id` removes associated CV subscriptions and, for the final
  owner, the candidate and its derived rows.
