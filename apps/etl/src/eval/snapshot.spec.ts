import { assertCorpusSnapshot, sha256 } from "./snapshot";
import type { EvaluationSnapshot } from "./types";

const corpus = { one: "g1:abc" };
const snapshot: EvaluationSnapshot = {
  generatedAt: "2026-07-28T00:00:00.000Z",
  corpusSha256: sha256(JSON.stringify(corpus)),
  prompt: { version: 3, sourceSha256: "prompt" },
  taxonomy: { roles: "Backend Engineer", domains: "Fintech", skills: "TypeScript" },
  aliases: {},
};

describe("golden snapshot", () => {
  it("accepts the corpus it hashes", () => {
    expect(() => assertCorpusSnapshot(corpus, snapshot)).not.toThrow();
  });

  it("rejects a corpus changed after its snapshot", () => {
    expect(() => assertCorpusSnapshot({ one: "g1:changed" }, snapshot)).toThrow(/differs/);
  });
});
