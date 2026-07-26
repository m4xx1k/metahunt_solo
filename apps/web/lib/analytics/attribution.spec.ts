import { readAcquisitionAttribution } from "./attribution";

describe("readAcquisitionAttribution", () => {
  it("keeps bounded campaign identifiers", () => {
    expect(
      readAcquisitionAttribution({
        utm_source: "telegram",
        utm_medium: "community-post",
        utm_campaign: "backend_launch.v1",
        creative_id: ["pain-hook-01", "ignored"],
      }),
    ).toEqual({
      utm_source: "telegram",
      utm_medium: "community-post",
      utm_campaign: "backend_launch.v1",
      creative_id: "pain-hook-01",
    });
  });

  it("drops free-form and oversized values before analytics", () => {
    expect(
      readAcquisitionAttribution({
        utm_source: "person@example.com",
        utm_campaign: "a".repeat(65),
        utm_content: "backend engineers",
        unrelated: "keep-out",
      }),
    ).toEqual({});
  });
});

function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    store,
  };
}

const KEY = "metahunt.analytics.first_touch";

describe("first-touch persistence", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    jest.resetModules();
  });

  async function loadWithWindow(win: ReturnType<typeof fakeWindow>) {
    (globalThis as { window?: unknown }).window = win;
    return import("./attribution");
  }

  it("stores the first tagged arrival and never overwrites it", async () => {
    const win = fakeWindow();
    const { persistFirstTouch, storedFirstTouch } = await loadWithWindow(win);

    persistFirstTouch("?utm_source=reddit&utm_campaign=20260723-launch");
    persistFirstTouch("?utm_source=dou&utm_campaign=later-post");

    expect(storedFirstTouch()).toEqual({
      utm_source: "reddit",
      utm_campaign: "20260723-launch",
    });
  });

  it("ignores untagged visits and unsafe values", async () => {
    const win = fakeWindow();
    const { persistFirstTouch } = await loadWithWindow(win);

    persistFirstTouch("");
    persistFirstTouch("?utm_source=person@example.com");

    expect(win.store.has(KEY)).toBe(false);
  });

  it("resolves current tags first, stored first touch as the fallback", async () => {
    const win = fakeWindow({ [KEY]: JSON.stringify({ utm_source: "reddit" }) });
    const { resolveAttribution } = await loadWithWindow(win);

    expect(resolveAttribution({ utm_source: "dou" })).toEqual({ utm_source: "dou" });
    expect(resolveAttribution({})).toEqual({ utm_source: "reddit" });
  });

  it("survives corrupted storage", async () => {
    const win = fakeWindow({ [KEY]: "{not json" });
    const { storedFirstTouch } = await loadWithWindow(win);

    expect(storedFirstTouch()).toEqual({});
  });
});
