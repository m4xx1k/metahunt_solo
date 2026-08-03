-- RELEASE GATE: do not run this migration until release owner approval records
-- the reviewed unowned-subscription inventory and a tested restorable backup.
-- It deliberately does not delete, attach, or otherwise infer an owner for
-- legacy rows. See md/journal/product-analytics-v2-release-gates.md.
ALTER TABLE "subscriptions" ALTER COLUMN "user_id" SET NOT NULL;
