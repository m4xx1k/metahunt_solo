import { decodeText } from "../corpus-codec";
import { paths, readJson, writeJson } from "../paths";
import type { CandidatesFile } from "../types";

export async function arbitrate(): Promise<void> {
  const { candidates } = readJson<CandidatesFile>(paths.candidates);
  const corpus = readJson<Record<string, string>>(paths.corpus);

  const items = candidates.flatMap((c) => {
    const contested = Object.entries(c.fields).filter(([, cell]) => cell.verdict === "contested");
    if (contested.length === 0) return [];
    return [
      {
        id: c.id,
        title: c.title,
        text: decodeText(corpus[c.id]),
        contested: contested.map(([field, cell]) => ({ field, a: cell.a, b: cell.b })),
      },
    ];
  });

  const cells = items.reduce((n, i) => n + i.contested.length, 0);
  writeJson(paths.arbitration, { cells, items });
  console.log(`${cells} contested cells across ${items.length} postings → ${paths.arbitration}`);
}
