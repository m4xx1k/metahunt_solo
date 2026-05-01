# Security

Defensive defaults. Most are framework-supported — use them.

## Validate at the boundary

All external input — HTTP body, query params, file uploads, RSS payloads, LLM output — gets validated before it reaches business logic. Use `class-validator` (NestJS DTOs), `zod`, or BAML's schema-aligned parsing. Trust validated input internally.

## Files

- Whitelist MIME types, not blacklist.
- Cap file size explicitly.
- Verify file content matches the declared type (don't trust the extension).
- Generate the stored filename yourself (UUID + ext) — never use the user-supplied one.

## Auth — passwords

- Hash with bcrypt (cost ≥12) or argon2id.
- Same error message for "user not found" and "wrong password" — prevents user enumeration.
- Constant-time comparison (`bcrypt.compare` is fine).
- Lock account after N failed attempts; reset on success.

## Auth — tokens

- Access tokens: short-lived (15 min), JWT-signed.
- Refresh tokens: longer (7 days), stored as a hash server-side so they can be revoked.
- Invalidate all refresh tokens on password change.
- Rotate signing secrets periodically.

## Authorization

- Role checks on every protected endpoint.
- Resource ownership checks too — having "user" role doesn't mean you can edit *every* user's row.
- Centralize the rules in one service. Don't scatter `if (user.role === 'admin')` across the codebase.
- Audit admin actions.

## SQL / query safety

- Always parameterized — Drizzle, query builders, prepared statements. Never string-interpolate user input into SQL.
- Validate UUIDs / enums at the DTO layer; the validator catches malformed ids before any query runs.

## Data at rest

- Encrypt sensitive columns (PII, payment data) at the column level (`aes-256-gcm`) — store IV and auth tag alongside.
- Secrets live in env vars or secret managers, never in code or commits.
- `.env*` in `.gitignore`. Verify before pushing a fresh repo.

## Rate limiting

- Auth endpoints: tight (e.g., 5 / 60s per IP+email).
- General API: looser, per-user or per-IP.
- Return 429 with `Retry-After`.

## Headers and transport

- HTTPS only in any non-local environment.
- `helmet` (or equivalent) for default secure headers.
- CORS allowlist explicit; never `*` for endpoints that take cookies / tokens.

## Don'ts

- No secrets in logs, errors, or commit messages.
- No user-controlled data in SQL strings, shell commands, or `eval`.
- No exposing internal stacks / codes to external callers.
- No skipping auth checks "because the frontend already does it".
