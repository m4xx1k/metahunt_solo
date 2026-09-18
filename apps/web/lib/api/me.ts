import { apiDelete, apiGet, apiPatch } from "./client";
import type { SubscriptionFilter } from "./filters";

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

/** `live` delivers; `pending` was never confirmed in Telegram; `off` is switched off. */
export type MeSubscriptionStatus = "live" | "pending" | "off";

interface MeSubscriptionBase {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  status: MeSubscriptionStatus;
  createdAt: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  /**
   * Display name per node ref in `params` — the editor labels its selection
   * from this, since the feed catalogs only carry refs that have vacancies.
   * Optional so a web deploy that lands before the API one still parses; an
   * absent map just falls back to the catalogs, i.e. the old behaviour.
   */
  refNames?: Record<string, string>;
}

export interface MeCvSubscription extends MeSubscriptionBase {
  isCv: true;
  candidateId: string;
  /** The CV this digest ranks against — null once that CV is deleted. */
  cvLabel: string | null;
  cvAddedAt: string | null;
  /** Same filter as a feed subscription: the CV ranks it, it does not narrow it. */
  params: SubscriptionFilter;
}

export interface MeFeedSubscription extends MeSubscriptionBase {
  isCv: false;
  candidateId: null;
  params: SubscriptionFilter;
}

export type MeSubscription = MeCvSubscription | MeFeedSubscription;

export interface UpdateSubscription {
  name?: string;
  isActive?: boolean;
  params?: SubscriptionFilter;
}

export const meApi = {
  deleteAccount: () => apiDelete<{ ok: true }>("/me"),
  listCvs: () => apiGet<MeCv[]>("/me/cv"),
  deleteCv: (id: string) => apiDelete<{ ok: true }>(`/me/cv/${id}`),
  // Makes this CV the one GET /feed scores against (MET-144: no `?cv=` param
  // — the CV switcher calls this instead of encoding the pick in the URL).
  activateCv: (id: string) => apiPatch<{ ok: true }>(`/me/cv/${id}/activate`, {}),
  listSubscriptions: () => apiGet<MeSubscription[]>("/me/subscriptions"),
  updateSubscription: (id: string, patch: UpdateSubscription) =>
    apiPatch<{ ok: true }>(`/me/subscriptions/${id}`, patch),
  setSubscriptionActive: (id: string, isActive: boolean) =>
    apiPatch<{ ok: true }>(`/me/subscriptions/${id}`, { isActive }),
  deleteSubscription: (id: string) => apiDelete<{ ok: true }>(`/me/subscriptions/${id}`),
};
