-- subscriptions.candidate_id was text while candidates.id and
-- user_cvs.candidate_id are uuid, so any join between them needed a cast and
-- silently matched nothing without one. NULLIF covers rows that stored an empty
-- string; anything else that is not a uuid aborts the migration on purpose —
-- nulling it would throw away which CV a live digest ranks against.
ALTER TABLE "subscriptions"
  ALTER COLUMN "candidate_id" SET DATA TYPE uuid
  USING NULLIF("candidate_id", '')::uuid;
