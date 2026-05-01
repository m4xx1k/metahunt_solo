# Product

Product, business, and UX context for metahunt. Separate from engineering — the system shape and code-level decisions live in `md/architecture/` + `md/journal/`, general engineering rules in `md/engineering/`.

## What belongs here

- User flows (job seeker, recruiter — discovery, search, application, response paths)
- Pain points — what's broken in the current Ukrainian IT job market
- Economics — acquisition, retention, monetization model, unit economics
- Market positioning — vs Djinni, DOU, LinkedIn, Telegram channels
- Pricing experiments and rationale
- User research notes (interviews, surveys, behavioural data)
- Feature ideas at the product (not engineering) level

## What does NOT belong here

- System architecture → `md/architecture/`
- Engineering decisions → `md/journal/decisions/`
- Operational how-tos → `md/runbook/`
- Code style / patterns → `md/engineering/`

## Conventions

- **One concept per file.** ≤300 lines each (per `CLAUDE.md`).
- **Filename = kebab-case slug** (e.g. `user-flow-job-seeker.md`, `pricing-v1.md`, `pain-recruiter.md`).
- **Lead with the question or problem**, then the answer / current state / decision.
- **Date observations of the world.** If you describe the market or current user behavior, mark the date — markets shift.
- **Cross-link, don't duplicate.** If a product decision blocks engineering work, write the engineering side as an ADR in `md/journal/decisions/` and link from there to the product file.

## Index

*(empty — add entries here as files are created)*
