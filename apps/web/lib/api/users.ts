// Web-side wire types + fetcher for the waitlist signup API.
// Source of truth: apps/etl/src/users/users.contract.ts.
// Hand-mirrored per ADR-0005.

import { apiPost } from "./client";

export type SignupSource = "landing-cta";

export interface SubscribeRequest {
  email: string;
  source: SignupSource;
}

export type SubscribeStatus = "subscribed" | "already_subscribed";

export interface SubscribeResponse {
  status: SubscribeStatus;
}

export const usersApi = {
  subscribe: (email: string, source: SignupSource = "landing-cta") =>
    apiPost<SubscribeResponse>("/users/subscribe", { email, source }),
};
