# ADR-0011 — Subscription-scoped match criteria

**Status:** accepted
**Date:** 2026-07-30
**Context (in time):** `/match` preferences are in progress on top of ADR-0008
**Branch:** `feat/match-preferences`

## Context

A candidate row represents facts extracted from one CV and then confirmed by its owner. One CV can
support several independent job searches. Desired roles, excluded skills, and vacancy filters express
search intent, not facts about that CV.

Persisting intent on the candidate makes every CV-backed subscription share it. Editing one alert would
silently change the others.

## Options

### Candidate-scoped preferences

- Easy for the warm feed because candidate matching can load defaults implicitly.
- Prevents independent searches from using the same CV.
- Makes a subscription edit mutate unrelated subscriptions.

### Subscription-scoped criteria

- Keeps CV facts reusable across independent searches.
- Lets each subscription own its roles, excluded skills, and other filters.
- Requires `/match` to carry a transient draft before a subscription exists.

## Decision

Match criteria are subscription-scoped.

- `candidates` and `candidate_nodes` contain extracted and owner-confirmed CV facts.
- A `/match` session holds a transient criteria draft used for preview requests.
- Creating a CV subscription snapshots that draft into `subscriptions.params`.
- `subscriptions.candidate_id` selects the CV; its criteria affect only that subscription.
- Editing candidate facts affects every preview and subscription that references the candidate.
- Editing one subscription never mutates the candidate or another subscription.

The HTTP preview and digest paths must use one candidate-matching use case. JSONB is a persistence
detail; application code consumes validated, typed criteria.

## Consequences

- The unshipped candidate preference tables and endpoint are removed before merge.
- Role and excluded-skill node references join the CV subscription criteria contract.
- Existing subscriptions retain their current semantics; no automatic conversion is allowed.
- Subscription editing can be added later without changing candidate ownership.
- A user can upload several CVs and create several subscriptions for any one of them.
