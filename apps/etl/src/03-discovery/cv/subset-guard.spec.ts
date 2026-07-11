import type { EntitySet } from "./cv-tailor.contract";
import { checkBullet, extractMetrics, extractTech, extractYears } from "./subset-guard";

const EMPTY: EntitySet = { tech: [], orgs: [], metrics: [], dates: [], titles: [] };
const src = (p: Partial<EntitySet> = {}): EntitySet => ({ ...EMPTY, ...p });

describe("extractTech", () => {
  it("resolves aliases to canonical names", () => {
    expect(extractTech("we use pg and k8s and node")).toEqual(
      expect.arrayContaining(["PostgreSQL", "Kubernetes", "Node.js"]),
    );
  });

  it("matches multi-word and special-char tech", () => {
    const t = extractTech("Built on AWS ECS with GitHub Actions, C++, C#, Node.js and .NET");
    expect(t).toEqual(
      expect.arrayContaining(["AWS", "ECS", "GitHub Actions", "C++", "C#", "Node.js", ".NET"]),
    );
  });

  it("does not false-match tech substrings inside words", () => {
    // "scala" must not trigger "Scala" via "s"; "as3" must not trigger "S3"
    expect(extractTech("escalated the as3 codebase")).not.toContain("S3");
  });

  it("treats collision-prone terms as tech only when capitalized", () => {
    expect(extractTech("we react to feedback and move to the next step in spring")).not.toEqual(
      expect.arrayContaining(["React", "Next.js", "Spring"]),
    );
    expect(extractTech("Built with React and Spring")).toEqual(
      expect.arrayContaining(["React", "Spring"]),
    );
  });
});

describe("extractMetrics", () => {
  it("keeps significant tokens and their shape", () => {
    expect(extractMetrics("~59K products, 2,800+ mockups, ~40%, 80+ catalogs, 2M+ prices")).toEqual(
      expect.arrayContaining(["59k", "2800+", "40%", "80+", "2m+"]),
    );
  });

  it("ignores 4-digit years", () => {
    expect(extractMetrics("worked 2024 – 2025")).toEqual([]);
  });

  it("normalizes spelled-out small numbers", () => {
    expect(extractMetrics("six quality checks")).toContain("6");
  });

  it("ignores lone single-digit integers in prose", () => {
    expect(extractMetrics("shipped 3 products")).not.toContain("3");
  });
});

describe("extractYears", () => {
  it("finds 4-digit years", () => {
    expect(extractYears("from Sep 2021 to 2024")).toEqual(["2021", "2024"]);
  });
});

describe("checkBullet — faithful cases", () => {
  it("passes a verbatim bullet", () => {
    const text = "Built the ingestion pipeline normalizing 80+ catalogs into ~59K products.";
    const r = checkBullet({
      sourceText: text,
      tailoredText: text,
      sourceEntities: src({ tech: ["Elasticsearch"], metrics: ["80+", "59K"] }),
    });
    expect(r.faithful).toBe(true);
    expect(r.flags).toEqual([]);
  });

  it("passes the founder's real backend→fullstack rephrase (same facts)", () => {
    const source =
      "Owned the AI product-mockup pipeline end to end: it applies a client's logo to products with Gemini, then an LLM scores six quality checks and auto-rejects weak results — 2,800+ mockups generated with no manual review.";
    const tailored =
      "Replaced manual mockup creation with an AI pipeline — Gemini applies the client's logo, an LLM runs six quality checks and auto-rejects weak results — 2,800+ mockups shipped with no human review.";
    const r = checkBullet({
      sourceText: source,
      tailoredText: tailored,
      sourceEntities: src({ tech: ["Gemini"], metrics: ["2,800+"] }),
    });
    expect(r.faithful).toBe(true);
  });

  it("allows a tech that is in the global ledger though not this bullet", () => {
    const r = checkBullet({
      sourceText: "Built the search retrieval and re-rank stage.",
      tailoredText: "Built the Elasticsearch retrieval and LLM re-rank stage.",
      sourceEntities: src(),
      ledger: { tech: ["Elasticsearch", "GPT"] },
    });
    expect(r.faithful).toBe(true);
  });
});

describe("checkBullet — drift caught", () => {
  it("flags a technology the source never had", () => {
    const r = checkBullet({
      sourceText: "Built async workflows on RabbitMQ with Postgres.",
      tailoredText: "Built async workflows on RabbitMQ and Kubernetes with Postgres.",
      sourceEntities: src({ tech: ["RabbitMQ", "PostgreSQL"] }),
      ledger: { tech: ["RabbitMQ", "PostgreSQL"] },
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.map((f) => f.kind)).toContain("added-tech");
    expect(r.flags.find((f) => f.kind === "added-tech")?.token).toBe("Kubernetes");
  });

  it("flags an inflated metric (2,800 → 3,000)", () => {
    const r = checkBullet({
      sourceText: "2,800+ mockups generated with no manual review.",
      tailoredText: "3,000+ mockups generated with no manual review.",
      sourceEntities: src({ metrics: ["2,800+"] }),
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.map((f) => f.kind)).toContain("invented-metric");
  });

  it("flags a percentage change (~40% → ~50%)", () => {
    const r = checkBullet({
      sourceText: "Cut video-conversion time ~40% with a custom pipeline.",
      tailoredText: "Cut video-conversion time ~50% with a custom pipeline.",
      sourceEntities: src({ metrics: ["~40%"] }),
    });
    expect(r.faithful).toBe(false);
    expect(r.flags[0].token).toBe("50%");
  });

  it("flags dropping the '+' off 80+", () => {
    const r = checkBullet({
      sourceText: "normalizes 80+ supplier catalogs",
      tailoredText: "normalizes 80 supplier catalogs",
      sourceEntities: src({ metrics: ["80+"] }),
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.map((f) => f.kind)).toContain("invented-metric");
  });

  it("flags an employer bleeding in from another part of the CV", () => {
    const r = checkBullet({
      sourceText: "At Beana AI, built the ingestion pipeline.",
      tailoredText: "At Beana AI and IDS Group, built the ingestion pipeline.",
      sourceEntities: src({ orgs: ["Beana AI"] }),
      ledger: { orgs: ["Beana AI", "IDS Group"] },
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.map((f) => f.kind)).toContain("off-ledger-org");
  });

  it("flags a fabricated year", () => {
    const r = checkBullet({
      sourceText: "Delivered the civic-voting mini app solo.",
      tailoredText: "Delivered the civic-voting mini app solo in 2019.",
      sourceEntities: src(),
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.map((f) => f.kind)).toContain("off-ledger-date");
  });

  it("catches a capitalized added framework", () => {
    const r = checkBullet({
      sourceText: "Built the multi-tenant routing layer.",
      tailoredText: "Built the multi-tenant routing layer in React.",
      sourceEntities: src(),
      ledger: { tech: ["Node.js"] },
    });
    expect(r.faithful).toBe(false);
    expect(r.flags.find((f) => f.kind === "added-tech")?.token).toBe("React");
  });
});
