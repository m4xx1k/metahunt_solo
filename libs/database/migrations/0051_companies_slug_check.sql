-- Custom SQL migration file, put your code below! --
-- The slug is the resolve-or-create key: the loader looks an employer up by it,
-- so an empty slug silently merges unrelated companies into one row. The old
-- resolver stripped non-ASCII with no fallback, which collapsed every
-- Cyrillic-only employer into a single company — a 2026-08 restore still shows
-- one row named ЛУН holding 264 vacancies from 97 real employers.
--
-- `slugifyCompany` now romanises and falls back to a digest, and production was
-- re-resolved by it (verified 0 unsafe slugs across 2,628 companies before this
-- landed). This constraint is what stops a future resolver from reintroducing
-- the same class of bug silently.
--
-- Validated, not NOT VALID: every live database was checked clean first. A
-- restore of a pre-fix dump will fail here, which is the correct outcome — that
-- data really is corrupt, and failing loudly beats carrying it forward.
ALTER TABLE companies
  ADD CONSTRAINT companies_slug_safe CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$');
