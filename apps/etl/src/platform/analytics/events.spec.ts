import { ANALYTICS_EVENTS, SYSTEM_EMITTED_EVENTS, USER_ACTION_EVENTS } from "./events";

// The two sets must partition every event name: a new event that is neither
// classified would silently fall out of "last action" (and out of any future
// user-vs-system split), which is exactly the bug this guards.
describe("event classification", () => {
  const all = Object.values(ANALYTICS_EVENTS);

  it("classifies every event as either user-caused or system-emitted", () => {
    const classified = [...USER_ACTION_EVENTS, ...SYSTEM_EMITTED_EVENTS];
    expect([...classified].sort()).toEqual([...all].sort());
  });

  it("never puts the same event in both sets", () => {
    const overlap = USER_ACTION_EVENTS.filter((name) =>
      (SYSTEM_EMITTED_EVENTS as readonly string[]).includes(name),
    );
    expect(overlap).toEqual([]);
  });

  it("keeps our own delivery events out of the user-caused set", () => {
    for (const name of [
      ANALYTICS_EVENTS.digestSent,
      ANALYTICS_EVENTS.digestEvaluated,
      ANALYTICS_EVENTS.digestDeliveryFailed,
    ]) {
      expect(USER_ACTION_EVENTS).not.toContain(name);
    }
  });
});
