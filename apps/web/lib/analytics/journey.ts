import { isUuid } from "./uuid";

const JOURNEY_STORAGE_KEY = "metahunt.analytics.journey_id";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
let memoryJourneyId: string | undefined;

export interface JourneyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getOrCreateJourneyId(): string {
  if (memoryJourneyId) return memoryJourneyId;
  const created = crypto.randomUUID();
  if (typeof window === "undefined") return created;

  memoryJourneyId = readOrCreateStoredJourney(window.localStorage, () => created);
  return memoryJourneyId;
}

export function readOrCreateStoredJourney(storage: JourneyStorage, create: () => string): string {
  const created = create();
  try {
    const stored = storage.getItem(JOURNEY_STORAGE_KEY);
    const journeyId = resolveJourneyId(stored, () => created);
    if (journeyId !== stored) storage.setItem(JOURNEY_STORAGE_KEY, journeyId);
    return journeyId;
  } catch {
    return created;
  }
}

export function resolveJourneyId(stored: string | null, create: () => string): string {
  return stored && stored !== NIL_UUID && isUuid(stored) ? stored : create();
}
