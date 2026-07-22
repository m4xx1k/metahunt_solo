import { BadRequestException } from "@nestjs/common";

import { parseBrowserEventInput } from "./browser-event.contract";

describe("parseBrowserEventInput", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps only allow-listed bounded properties", () => {
    const event = parseBrowserEventInput({
      journeyId: "7ba87d7c-2005-4b28-b4f7-29a3f7be3a8d",
      eventId: "210429c6-288f-42cb-89b5-2708eb1592d1",
      name: "landing_view",
      occurredAt: "2026-07-22T11:59:00.000Z",
      properties: {
        landing_variant: "backend-radar",
        utm_source: "telegram",
        chat_id: "must-not-pass",
      },
    });

    expect(event.occurredAt).toEqual(new Date("2026-07-22T11:59:00.000Z"));
    expect(event.properties).toEqual({
      landing_variant: "backend-radar",
      utm_source: "telegram",
    });
  });

  it("replaces stale client time with server receipt time", () => {
    const event = parseBrowserEventInput({
      journeyId: "7ba87d7c-2005-4b28-b4f7-29a3f7be3a8d",
      eventId: "210429c6-288f-42cb-89b5-2708eb1592d1",
      name: "subscription_handoff_opened",
      occurredAt: "2026-07-20T12:00:00.000Z",
    });

    expect(event.occurredAt).toEqual(new Date("2026-07-22T12:00:00.000Z"));
  });

  it("rejects event names outside the public contract", () => {
    expect(() =>
      parseBrowserEventInput({
        journeyId: "7ba87d7c-2005-4b28-b4f7-29a3f7be3a8d",
        eventId: "210429c6-288f-42cb-89b5-2708eb1592d1",
        name: "telegram_linked",
      }),
    ).toThrow(BadRequestException);
  });
});
