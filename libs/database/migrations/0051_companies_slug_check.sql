-- Custom SQL migration file, put your code below! --
-- The slug is the resolve-or-create key: the loader looks an employer up by it,
-- so an empty slug silently merges unrelated companies into one row. The old
-- resolver stripped non-ASCII with no fallback, which collapsed every
-- Cyrillic-only employer into a single company. `slugifyCompany` now romanises
-- and falls back to a digest; this is what stops a future resolver from
-- reintroducing the same class of bug.
--
-- NOT VALID on purpose: it guards every insert and update from now on, but
-- tolerates the collapsed rows that predate the repair — so this migration is
-- safe to deploy before `company:recover --apply` has run on that database.
-- The repair itself runs VALIDATE at the end of its transaction, which is what
-- makes the constraint fully trusted exactly when the data has earned it.
ALTER TABLE companies
  ADD CONSTRAINT companies_slug_safe CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$') NOT VALID;
