// Name + lifetime for the server-readable session cookie. Mirrors the
// localStorage key in auth-token.ts but lives separately since this constant
// is shared by a Server Component (layout.tsx), a Route Handler
// (app/api/session/route.ts), and client.ts's server-side fetch path.
export const SESSION_COOKIE = "metahunt_session";

// Matches the backend JWT lifetime (apps/etl/src/platform/auth/auth.module.ts
// signOptions.expiresIn: "30d") so the cookie doesn't outlive or expire ahead
// of the token it carries.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
