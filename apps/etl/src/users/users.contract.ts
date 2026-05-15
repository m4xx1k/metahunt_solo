/**
 * Wire contract for the waitlist signup API.
 *
 * Kept free of NestJS / Drizzle / runtime imports so the web client can
 * import these types directly without pulling in server dependencies.
 */

export type SignupSource = "landing-cta";

export interface SubscribeRequest {
  email: string;
  source: SignupSource;
}

export type SubscribeStatus = "subscribed" | "already_subscribed";

export interface SubscribeResponse {
  status: SubscribeStatus;
}

// Loose RFC-5322-shaped check: local@domain.tld with no whitespace.
// We're not authenticating against this address, only storing it — strict
// validation belongs to whatever sends mail downstream.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

export const ALLOWED_SIGNUP_SOURCES: readonly SignupSource[] = ["landing-cta"];
