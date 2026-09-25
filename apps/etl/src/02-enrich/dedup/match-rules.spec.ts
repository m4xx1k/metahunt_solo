import {
  containment,
  DEFAULT_THRESHOLDS,
  isSame,
  requisitionNo,
  shingles,
  titleKey,
  titleLevels,
  titleSim,
  vetoes,
  type MatchContext,
  type PostingFacts,
} from "./match-rules";

const DOU = "src-dou";
const DJINNI = "src-djinni";
const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");

const BOILERPLATE =
  "We are a global digital engineering company with offices in twenty countries. We offer " +
  "competitive compensation, flexible schedule, medical insurance, paid vacation, sick leaves, " +
  "education budget, English courses, corporate events and a friendly team of professionals. ";

function words(seed: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");
}

let seq = 0;
function posting(p: {
  title: string;
  source?: string;
  sourceCode?: string;
  company?: string | null;
  companyName?: string | null;
  description?: string;
  fingerprint?: string | null;
  seniority?: string | null;
  role?: string | null;
  day?: number;
}): PostingFacts {
  const source = p.source ?? DOU;
  return {
    id: `v${++seq}`,
    sourceId: source,
    companyId: p.company === undefined ? "company-1" : p.company,
    title: p.title,
    titleLevels: titleLevels(p.title),
    titleKey: titleKey(p.title, {
      sourceCode: p.sourceCode ?? (source === DOU ? "dou" : "djinni"),
      companyName: p.companyName ?? null,
    }),
    seniority: p.seniority ?? null,
    roleNodeId: p.role ?? null,
    publishedAt: T0 + (p.day ?? 0) * DAY,
    fingerprint: p.fingerprint === undefined ? `fp-${seq}` : p.fingerprint,
    shingles: shingles(p.description ?? words(`w${seq}x`, 80)),
  };
}

function ctx(opts: { cosine?: number | null; overrides?: [string, string][] } = {}): MatchContext {
  const overrides = new Set((opts.overrides ?? []).map(([a, b]) => [a, b].sort().join("|")));
  return {
    thresholds: DEFAULT_THRESHOLDS,
    cosine: () => opts.cosine ?? null,
    isOverridden: (a, b) => overrides.has([a.id, b.id].sort().join("|")),
  };
}

function same(a: PostingFacts, b: PostingFacts, c = ctx()) {
  return vetoes(a, b, c) === null ? isSame(a, b, c) : null;
}

describe("titleKey", () => {
  it("strips the DOU company + location + salary suffix", () => {
    const dou = titleKey("Senior Product Analyst в SKELAR, Варшава (Польща)", {
      sourceCode: "dou",
      companyName: "SKELAR",
    });
    const djinni = titleKey("Senior Product Analyst", { sourceCode: "djinni", companyName: null });
    expect(dou).toBe(djinni);
    expect(
      titleKey("Middle PHP Developer в SharpMinds, $2000–3000, Чернівці, віддалено", {
        sourceCode: "dou",
        companyName: null,
      }),
    ).toBe("engineer php");
  });

  it("keeps a company that itself contains ' в ' out of the key", () => {
    expect(
      titleKey("Network Security Senior Consultant в KPMG в Україні, Київ, віддалено", {
        sourceCode: "dou",
        companyName: "KPMG в Україні",
      }),
    ).toBe("consultant network security");
  });

  it("keeps ' в ' inside a Djinni title", () => {
    expect(
      titleKey("Data Engineer в продуктову компанію", { sourceCode: "djinni", companyName: null }),
    ).toContain("продуктову");
  });

  it("decodes entities and treats slashes as separators", () => {
    const a = titleKey("QA\\QC Engineer", { sourceCode: "djinni", companyName: null });
    const b = titleKey("QA \\ QC Engineer", { sourceCode: "djinni", companyName: null });
    expect(a).toBe(b);
    expect(titleKey("R&amp;D Engineer", { sourceCode: "djinni", companyName: null })).toContain(
      "r",
    );
  });

  it("is word-order independent", () => {
    expect(titleKey("Automation QA Engineer", { sourceCode: "djinni", companyName: null })).toBe(
      titleKey("QA Automation Engineer", { sourceCode: "djinni", companyName: null }),
    );
  });

  it("keeps parenthesised qualifiers apart", () => {
    const rnd = titleKey("Інженер БпЛА (RnD)", { sourceCode: "djinni", companyName: null });
    const fpv = titleKey("Інженер БпЛА (FPV)", { sourceCode: "djinni", companyName: null });
    expect(rnd).not.toBe(fpv);
    expect(titleSim(rnd, fpv)).toBeLessThan(DEFAULT_THRESHOLDS.title);
  });

  it("drops a trailing ' at Company' and requisition numbers", () => {
    expect(
      titleKey("Middle Frontend Developer (Angular) at Fleet Chaser", {
        sourceCode: "djinni",
        companyName: null,
      }),
    ).toBe("angular engineer frontend");
    expect(
      titleKey("Expert .NET Engineer (3117)", { sourceCode: "djinni", companyName: null }),
    ).toBe("engineer expert net");
  });
});

describe("title seniority", () => {
  it("is not part of the key but still vetoes", () => {
    const key = (t: string) => titleKey(t, { sourceCode: "djinni", companyName: null });
    expect(key("Senior QA Engineer")).toBe(key("Middle QA Engineer"));
    expect(titleLevels("Middle/Senior PHP Developer")).toEqual(["MIDDLE", "SENIOR"]);
    const text = words("sdet", 80);
    const a = posting({ title: "Senior SDET", source: DJINNI, company: null, description: text });
    const b = posting({ title: "Middle SDET", source: DJINNI, company: null, description: text });
    expect(vetoes(a, b, ctx())).toBe("seniority");
    const c = posting({
      title: "Middle/Senior SDET",
      source: DOU,
      company: null,
      description: text,
    });
    expect(vetoes(a, c, ctx())).toBeNull();
  });

  it("treats developer and engineer as one word and drops the company's own name", () => {
    expect(titleKey("Backend Developer", { sourceCode: "djinni", companyName: null })).toBe(
      titleKey("Backend Engineer", { sourceCode: "djinni", companyName: null }),
    );
    expect(
      titleKey("Technical QA Engineer (Kiss My Apps)", {
        sourceCode: "djinni",
        companyName: "Kiss My Apps",
      }),
    ).toBe("engineer qa technical");
  });
});

describe("requisitionNo", () => {
  it.each([
    ["Senior .NET Engineer (3117)", "3117"],
    ["Senior Java Engineer with Solr (#5020) в N-iX", "5020"],
    ["Presale Tech Lead (#1229)", "1229"],
    ["QA Engineer (100% remote)", null],
    ["Engineer #100%", null],
    ["Salary $5000–6000", null],
    ["Graduate program (2026)", null],
    ["Engineer (12)", null],
    ["Engineer #1234567", null],
  ])("%s → %s", (title, expected) => {
    expect(requisitionNo(title)).toBe(expected);
  });
});

describe("containment", () => {
  it("is intersection over the smaller set", () => {
    const small = shingles(words("a", 20));
    const big = shingles(`${words("a", 20)} ${words("b", 200)}`);
    expect(containment(small, big)).toBe(1);
    expect(containment(small, shingles(words("c", 20)))).toBe(0);
    expect(containment(small, new Uint32Array())).toBe(0);
  });
});

describe("vetoes + isSame", () => {
  it("Holy Water AI Engineer ≠ AI Video Creator (same company, shared boilerplate)", () => {
    const a = posting({
      title: "AI Engineer в HOLYWATER TECH, Київ, віддалено",
      companyName: "HOLYWATER TECH",
      description: `${BOILERPLATE} ${words("llm", 30)}`,
    });
    const b = posting({
      title: "AI Video Creator в HOLYWATER TECH, Київ, віддалено",
      companyName: "HOLYWATER TECH",
      description: `${BOILERPLATE} ${words("video", 30)}`,
    });
    expect(vetoes(a, b, ctx({ cosine: 0.96 }))).toBe("same_source_content");
    const djinniB = { ...b, sourceId: DJINNI };
    expect(same(a, djinniB, ctx({ cosine: 0.96 }))).toBeNull();
  });

  it("Ciklum (3117) ≠ (3118) even with identical text", () => {
    const text = words("dotnet", 100);
    const a = posting({ title: "Expert .NET Engineer (3117)", source: DJINNI, description: text });
    const b = posting({ title: "Expert .NET Engineer (3118)", source: DOU, description: text });
    expect(vetoes(a, b, ctx({ cosine: 0.99 }))).toBe("requisition");
  });

  it("merges a DOU posting with its Djinni twin", () => {
    const text = words("analyst", 120);
    const a = posting({
      title: "Senior Product Analyst в SKELAR, Варшава (Польща)",
      companyName: "SKELAR",
      description: text,
    });
    const b = posting({
      title: "Senior Product Analyst",
      source: DJINNI,
      description: text,
      day: 3,
    });
    expect(same(a, b)).toMatchObject({ rule: "cross_source", titleSim: 1, containment: 1 });
  });

  it("merges a reworded cross-source twin on cosine when companies agree", () => {
    const a = posting({ title: "QA Automation Engineer", source: DJINNI });
    const b = posting({ title: "Automation QA Engineer в Acme, Київ", day: 1 });
    expect(same(a, b, ctx({ cosine: 0.95 }))).toMatchObject({ rule: "cross_source" });
    expect(same(a, b, ctx({ cosine: 0.93 }))).toBeNull();
  });

  it("needs the strict pair when a company is unknown", () => {
    const a = posting({ title: "QA Automation Engineer (Python)", source: DJINNI, company: null });
    const b = posting({ title: "QA Automation Engineer в Acme, Київ", day: 1 });
    expect(same(a, b, ctx({ cosine: 0.99 }))).toBeNull();
    const c = posting({ title: "QA Automation Engineer в Acme, Київ", day: 1 });
    expect(same(a, c, ctx({ cosine: 0.94 }))).toBeNull();
    const d = posting({ title: "QA Automation Engineer (Python) в Acme, Київ", day: 1 });
    expect(same(a, d, ctx({ cosine: 0.96 }))).toMatchObject({ rule: "cross_source" });
  });

  it("Інженер БпЛА (RnD) ≠ (FPV)", () => {
    const text = words("drone", 100);
    const a = posting({ title: "Інженер БпЛА (RnD)", source: DJINNI, description: text });
    const b = posting({ title: "Інженер БпЛА (FPV) в Acme, Київ", description: text });
    expect(same(a, b, ctx({ cosine: 0.99 }))).toBeNull();
  });

  it("near-identical same-source reposts are one job", () => {
    const body = words("sdet", 200);
    const reposts = Array.from({ length: 19 }, (_, i) =>
      posting({
        title: "Senior SDET — Data Platform / Query Engine",
        source: DJINNI,
        company: null,
        description: `${body} posted ${i}`,
        day: i * 3,
      }),
    );
    for (let i = 1; i < reposts.length; i++) {
      expect(same(reposts[i - 1], reposts[i])).toMatchObject({ rule: "repost" });
    }
  });

  it("same-title outsourcer postings for different projects stay apart", () => {
    const a = posting({
      title: "Senior Java Developer",
      source: DJINNI,
      description: `${BOILERPLATE} ${words("fintech", 60)}`,
    });
    const b = posting({
      title: "Senior Java Developer",
      source: DJINNI,
      description: `${BOILERPLATE} ${words("healthcare", 60)}`,
      day: 2,
    });
    expect(vetoes(a, b, ctx())).toBe("same_source_content");
  });

  it("identical content is exact, also on one board", () => {
    const a = posting({ title: "Go Developer", fingerprint: "fp" });
    const b = posting({ title: "Go Developer", fingerprint: "fp", day: 10 });
    expect(same(a, b)).toMatchObject({ rule: "exact" });
  });

  it("does not link outside the 45-day window, but time never vetoes", () => {
    const a = posting({ title: "Go Developer", fingerprint: "fp2" });
    const b = posting({ title: "Go Developer", fingerprint: "fp2", day: 46 });
    expect(vetoes(a, b, ctx())).toBeNull();
    expect(isSame(a, b, ctx())).toBeNull();
  });

  it("extracted role and seniority do not veto the same text; title levels still do", () => {
    const text = words("repost", 80);
    const a = posting({
      title: "Founding Engineer",
      source: DJINNI,
      company: null,
      description: text,
      role: "r1",
      seniority: "SENIOR",
      fingerprint: "same",
    });
    const b = posting({
      title: "Founding Engineer",
      source: DJINNI,
      company: null,
      description: text,
      role: "r2",
      seniority: "MIDDLE",
      fingerprint: "same",
      day: 7,
    });
    expect(same(a, b)).toMatchObject({ rule: "exact" });
    const c = posting({
      title: "Middle Founding Engineer",
      source: DJINNI,
      company: null,
      description: text,
      fingerprint: "same",
    });
    const d = posting({
      title: "Senior Founding Engineer",
      source: DJINNI,
      company: null,
      description: text,
      fingerprint: "same",
    });
    expect(vetoes(c, d, ctx())).toBe("seniority");
  });

  it("company, seniority, role and manual overrides veto", () => {
    const text = words("x", 80);
    const edited = `${words("x", 70)} ${words("y", 10)}`;
    const a = posting({
      title: "Go Developer",
      source: DJINNI,
      description: text,
      seniority: "SENIOR",
      role: "r1",
    });
    expect(
      vetoes(a, posting({ title: "Go Developer", company: "company-2", description: text }), ctx()),
    ).toBe("company");
    expect(
      vetoes(
        a,
        posting({ title: "Go Developer", description: edited, seniority: "MIDDLE" }),
        ctx(),
      ),
    ).toBe("seniority");
    expect(
      vetoes(a, posting({ title: "Go Developer", description: edited, role: "r2" }), ctx()),
    ).toBe("role");
    const b = posting({ title: "Go Developer", description: text });
    expect(vetoes(a, b, ctx({ overrides: [[b.id, a.id]] }))).toBe("manual_override");
    expect(same(a, b)).toMatchObject({ rule: "cross_source" });
  });
});
