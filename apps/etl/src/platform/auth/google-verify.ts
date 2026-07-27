import { OAuth2Client } from "google-auth-library";

// What we keep from a verified Google ID token. `sub` is Google's stable,
// never-reused account id — the only field safe to key an identity on. Email
// can be reassigned within a Workspace domain, so it identifies a person, not
// an account. https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
export interface GoogleProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
}

// One client per process: it caches Google's JWKS, so a per-call instance would
// refetch the signing keys on every login.
let client: OAuth2Client | undefined;

// `audience` is the load-bearing argument: without it a token minted for any
// other site would verify here.
export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
): Promise<GoogleProfile | null> {
  client ??= new OAuth2Client();
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true,
      firstName: payload.given_name ?? payload.name ?? null,
    };
  } catch {
    return null;
  }
}
