// Web-side wire types + fetchers for the logged-in account surface (/me).
// Source of truth: apps/etl/src/account/me.contract.ts. All calls carry the
// Bearer token via lib/api/client.ts and run client-side.

import { apiDelete, apiGet, apiPatch } from "./client";

export interface MeCv {
  id: string;
  candidateId: string;
  label: string;
  isActive: boolean;
  role: string | null;
  seniority: string | null;
  experienceYears: number | null;
  createdAt: string;
}

export interface MeSubscription {
  id: string;
  label: string;
  isActive: boolean;
  isCv: boolean;
  createdAt: string;
}

export const meApi = {
  listCvs: () => apiGet<MeCv[]>("/me/cv"),
  deleteCv: (id: string) => apiDelete<{ ok: true }>(`/me/cv/${id}`),
  listSubscriptions: () => apiGet<MeSubscription[]>("/me/subscriptions"),
  setSubscriptionActive: (id: string, isActive: boolean) =>
    apiPatch<{ ok: true }>(`/me/subscriptions/${id}`, { isActive }),
  deleteSubscription: (id: string) =>
    apiDelete<{ ok: true }>(`/me/subscriptions/${id}`),
};
