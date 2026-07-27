import { DedupService } from "./dedup.service";

// `embedAll({ force: true })` used to loop forever: its WHERE is `true`, and
// writing a row does not change that, so an offset-less LIMIT re-fetched the same
// first page on every turn — one batch of billed embeddings per iteration, no
// termination. These tests exist because that cost real money before it was found.
describe("DedupService.embedAll", () => {
  const DIM = 1536;

  function harness(totalRows: number) {
    const rows = Array.from({ length: totalRows }, (_, i) => ({
      // Sortable ids so a `v.id > cursor` filter behaves like the real query.
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      last_rss_record_id: `r${i}`,
      title: `Vacancy ${i}`,
      description: "text",
      seniority: null,
      work_format: null,
      embedding_source_hash: null,
      embedding_model: null,
      published_at: null,
      role_name: "Backend Engineer",
      required_skills: ["Go"],
    }));

    let fetches = 0;
    const db = {
      execute: jest.fn(async (query: unknown) => {
        fetches += 1;
        // Recover the cursor and limit the way the real SQL would.
        const chunks = JSON.stringify(query);
        const cursor = [...chunks.matchAll(/00000000-0000-0000-0000-\d{12}/g)].pop()?.[0];
        const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
        return { rows: rows.slice(start, start + 100) };
      }),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({
            returning: jest.fn(async () => [{ id: "written" }]),
          })),
        })),
      })),
    };
    const openai = {
      model: "text-embedding-3-small",
      embed: jest.fn(async (texts: string[]) => texts.map(() => Array(DIM).fill(0.1))),
    };
    const svc = new DedupService(db as never, openai as never);
    return { svc, db, openai, fetches: () => fetches };
  }

  it("terminates in force mode instead of re-fetching the first page forever", async () => {
    const { svc, openai } = harness(250);

    const out = await svc.embedAll({ force: true });

    // 250 rows in batches of 100 = 3 pages, then an empty 4th ends the loop.
    expect(out.processed).toBe(250);
    expect(out.embedded).toBe(250);
    // The bug billed one batch per iteration without end; 3 calls is the ceiling.
    expect(openai.embed).toHaveBeenCalledTimes(3);
  });

  it("advances the cursor so no row is embedded twice", async () => {
    const { svc, openai } = harness(150);

    await svc.embedAll({ force: true });

    const seen = openai.embed.mock.calls.flatMap(([texts]) => texts);
    expect(seen).toHaveLength(150);
    expect(new Set(seen).size).toBe(150);
  });

  it("does nothing when there is nothing to embed", async () => {
    const { svc, openai } = harness(0);

    const out = await svc.embedAll({ force: true });

    expect(out.processed).toBe(0);
    expect(openai.embed).not.toHaveBeenCalled();
  });
});
