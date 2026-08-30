import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

import { decodeText } from "../corpus-codec";
import { paths, readJson, writeJson } from "../paths";
import {
  FIELDS,
  type CandidatesFile,
  type DatasetFile,
  type Decision,
  type DecisionsFile,
  type Extraction,
  type GoldenRow,
  type LabelCandidate,
} from "../types";

const PORT = 5055;
const PAGE = resolve(__dirname, "../review.html");

function loadDecisions(): Record<string, Decision> {
  if (!existsSync(paths.decisions)) return {};
  return readJson<DecisionsFile>(paths.decisions).decisions;
}

/**
 * Fields a human must click before the posting can be approved: the labellers split
 * and no arbiter ruled, so `cell.value` is null — approving would write that null in
 * as ground truth. Membership in `overrides` is the decided marker, not the value,
 * because null is itself a legitimate answer.
 */
export function undecidedFields(
  candidate: LabelCandidate,
  overrides: Record<string, unknown>,
): string[] {
  return FIELDS.filter((field) => {
    const cell = candidate.fields[field];
    return cell.verdict === "contested" && cell.arbiter === undefined && !(field in overrides);
  });
}

export function resolveValues(
  candidate: LabelCandidate,
  overrides: Record<string, unknown>,
): Extraction {
  const values: Record<string, unknown> = {};
  for (const field of FIELDS) {
    values[field] = field in overrides ? overrides[field] : candidate.fields[field].value;
  }
  return values;
}

// The approved values are snapshotted into the decision, so re-running `merge` cannot
// silently rewrite a row a human already signed off on.
function writeDataset(candidates: LabelCandidate[], decisions: Record<string, Decision>): number {
  const rows: GoldenRow[] = [];
  for (const candidate of candidates) {
    const decision = decisions[candidate.id];
    if (!decision?.approved) continue;
    rows.push({
      id: candidate.id,
      title: candidate.title,
      link: candidate.link,
      source: candidate.source,
      values: decision.values,
      approvedAt: decision.reviewedAt,
    });
  }
  const dataset: DatasetFile = { generatedAt: new Date().toISOString(), rows };
  writeJson(paths.dataset, dataset);
  return rows.length;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Concat before decoding: a Cyrillic character split across two chunks corrupts
    // if each chunk is stringified on its own.
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

type DecisionRequest = { id: string; approved: boolean; overrides: Record<string, unknown> };

function parseDecision(body: string, known: Set<string>): DecisionRequest {
  const raw: unknown = JSON.parse(body);
  if (typeof raw !== "object" || raw === null) throw new Error("body must be an object");
  const { id, approved, overrides } = raw as Record<string, unknown>;
  if (typeof id !== "string" || !known.has(id))
    throw new Error(`unknown posting id: ${String(id)}`);
  if (typeof approved !== "boolean") throw new Error("approved must be a boolean");
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error("overrides must be an object");
  }
  return { id, approved, overrides: overrides as Record<string, unknown> };
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const payload = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

export async function review(): Promise<void> {
  const { candidates } = readJson<CandidatesFile>(paths.candidates);
  const corpus = readJson<Record<string, string>>(paths.corpus);
  const decisions = loadDecisions();
  const texts = Object.fromEntries(candidates.map((c) => [c.id, decodeText(corpus[c.id])]));

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";

    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(PAGE, "utf8"));
      return;
    }

    if (url === "/api/data") {
      json(res, 200, { candidates, texts, decisions, fields: FIELDS });
      return;
    }

    if (url === "/api/decision" && req.method === "POST") {
      const body = parseDecision(await readBody(req), new Set(byId.keys()));
      const candidate = byId.get(body.id)!;

      const undecided = body.approved ? undecidedFields(candidate, body.overrides) : [];
      if (undecided.length > 0) {
        json(res, 409, { error: "undecided contested fields", undecided });
        return;
      }

      decisions[body.id] = {
        approved: body.approved,
        overrides: body.overrides,
        values: resolveValues(candidate, body.overrides),
        reviewedAt: new Date().toISOString(),
      };
      writeJson(paths.decisions, { generatedAt: new Date().toISOString(), decisions });
      const approved = writeDataset(candidates, decisions);
      json(res, 200, { approved, total: candidates.length });
      return;
    }

    json(res, 404, { error: "not found" });
  }

  // Loopback only: /api/data serves the decoded corpus, and a wildcard bind would put
  // the verbatim postings the codec hides on the LAN unauthenticated.
  server.listen(PORT, "127.0.0.1", () => {
    const approved = Object.values(decisions).filter((d) => d.approved).length;
    console.log(`\n  golden review — http://localhost:${PORT}`);
    console.log(`  ${approved}/${candidates.length} approved so far. Ctrl-C when done.\n`);
  });
}
