import {
  readOrCreateStoredJourney,
  resolveJourneyId,
  type JourneyStorage,
} from "./analytics-journey";

describe("resolveJourneyId", () => {
  const existing = "7ba87d7c-2005-4b28-b4f7-29a3f7be3a8d";
  const created = "210429c6-288f-42cb-89b5-2708eb1592d1";

  it("keeps a valid persisted journey", () => {
    expect(resolveJourneyId(existing, () => created)).toBe(existing);
  });

  it.each([null, "", "subscription-id", "00000000-0000-0000-0000-000000000000"])(
    "replaces an absent or malformed journey: %s",
    (stored) => {
      expect(resolveJourneyId(stored, () => created)).toBe(created);
    },
  );

  it("keeps the main flow alive when browser storage is unavailable", () => {
    const unavailableStorage: JourneyStorage = {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        throw new Error("storage blocked");
      },
    };

    expect(readOrCreateStoredJourney(unavailableStorage, () => created)).toBe(created);
  });
});
