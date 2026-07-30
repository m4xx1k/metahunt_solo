import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { CvMatchParams, SubscriptionParams } from "./subscriptions";

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

interface MeSubscriptionBase {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  tgUsername: string | null;
  tgFirstName: string | null;
}

export interface MeCvSubscription extends MeSubscriptionBase {
  isCv: true;
  candidateId: string;
  params: CvMatchParams;
}

export interface MeFeedSubscription extends MeSubscriptionBase {
  isCv: false;
  candidateId: null;
  params: SubscriptionParams;
}

export type MeSubscription = MeCvSubscription | MeFeedSubscription;

export interface UpdateSubscription {
  name?: string;
  isActive?: boolean;
  params?: CvMatchParams;
}

export const meApi = {
  deleteAccount: () => apiDelete<{ ok: true }>("/me"),
  listCvs: () => apiGet<MeCv[]>("/me/cv"),
  claimCv: (candidateId: string) => apiPost<{ ok: true }>("/me/cv", { candidateId }),
  deleteCv: (id: string) => apiDelete<{ ok: true }>(`/me/cv/${id}`),
  listSubscriptions: () => apiGet<MeSubscription[]>("/me/subscriptions"),
  updateSubscription: (id: string, patch: UpdateSubscription) =>
    apiPatch<{ ok: true }>(`/me/subscriptions/${id}`, patch),
  setSubscriptionActive: (id: string, isActive: boolean) =>
    apiPatch<{ ok: true }>(`/me/subscriptions/${id}`, { isActive }),
  deleteSubscription: (id: string) => apiDelete<{ ok: true }>(`/me/subscriptions/${id}`),
};
