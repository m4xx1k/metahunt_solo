-- Custom SQL migration file, put your code below! --
-- `params` is a subscription's identity: create() dedups on jsonb equality, so
-- every key in it splits alerts that should be one. Two keys no longer belong.
--
-- postedWithinDays was on 50 of 51 rows and nobody chose it — the feed always
-- sends its default freshness, and toSubscriptionParams() copied it in. Two
-- subscriptions to the same filter browsed at "week" and at "month" therefore
-- stored as different alerts.
--
-- minFitTier needs a scorer to mean anything, so on a filter subscription it
-- was a no-op that still changed the identity.
--
-- Checked against prod before writing this: no two rows differ ONLY by these
-- keys, so the strip merges nothing and cannot create a duplicate pair.
UPDATE subscriptions
SET params = params - 'postedWithinDays' - 'minFitTier'
WHERE params ?| array['postedWithinDays', 'minFitTier'];
