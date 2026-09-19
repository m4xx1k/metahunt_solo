import "dotenv/config";

import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import { format, resolveConfig } from "prettier";

import { parseDatasetCase } from "./load";

const DATASET_PATH = join(__dirname, "vacancy-requirements-v2.dataset.json");
const PORT = Number(process.env.EVAL_EDITOR_PORT ?? 4100);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(PAGE);
    return;
  }
  if (request.method === "GET" && request.url === "/dataset") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(readFileSync(DATASET_PATH, "utf8"));
    return;
  }
  if (request.method === "PUT" && request.url === "/dataset") {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      void (async () => {
        try {
          const rows = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          if (!Array.isArray(rows)) throw new Error("dataset must be an array");
          rows.forEach(parseDatasetCase);
          // Prettier owns this file in lint-staged. Its API ignores .prettierrc
          // unless the config is resolved explicitly, and it keeps the line breaks
          // its input had — so indented JSON goes in with the project's width.
          writeFileSync(
            DATASET_PATH,
            await format(JSON.stringify(rows, null, 2), {
              ...(await resolveConfig(DATASET_PATH)),
              parser: "json",
              filepath: DATASET_PATH,
            }),
          );
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ saved: rows.length }));
        } catch (error) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ error: error instanceof Error ? error.message : "bad input" }),
          );
        }
      })();
    });
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(PORT, () => {
  console.log(`dataset editor: http://localhost:${PORT}`);
  console.log(`editing ${DATASET_PATH}`);
});

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Golden set</title>
<style>
:root { color-scheme: light dark; --bg:#fff; --fg:#17181c; --muted:#6b7280; --line:#e3e5ea;
  --accent:#2557d6; --warn:#b54708; --ok:#067647; --field:#fff; }
@media (prefers-color-scheme: dark) { :root { --bg:#14151a; --fg:#e8e9ed; --muted:#9aa1ad;
  --line:#2a2d35; --accent:#7ea2ff; --field:#1c1e25; } }
* { box-sizing:border-box; }
body { margin:0; padding:0 16px 96px; background:var(--bg); color:var(--fg);
  font:14px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
main { max-width:1240px; margin:0 auto; }
header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
  padding:14px 0; margin-bottom:18px; display:flex; gap:14px; align-items:center; z-index:2; }
h1 { font-size:17px; margin:0; flex:1; }
button { font:inherit; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer;
  border:1px solid var(--accent); background:var(--accent); color:#fff; }
button[disabled] { opacity:.45; cursor:default; }
#status { color:var(--muted); font-size:13px; }
#status.err { color:var(--warn); }
#status.ok { color:var(--ok); }
details { border:1px solid var(--line); border-radius:10px; margin-bottom:10px; }
summary { cursor:pointer; padding:11px 14px; display:flex; gap:12px; align-items:baseline; }
summary b { flex:1; font-weight:600; }
.tag { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:4px 14px 16px;
  border-top:1px solid var(--line); }
@media (max-width:900px) { .cols { grid-template-columns:1fr; } }
h3 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted);
  margin:14px 0 6px; }
.vacancy { max-height:560px; overflow:auto; font-size:14px; line-height:1.72; }
.vacancy p { margin:0 0 4px; max-width:68ch; }
.vacancy p.gap { margin-top:14px; }
.vacancy p.head { font-weight:650; margin-top:18px; }
label { display:block; margin-bottom:10px; }
label span { display:block; font-size:12px; color:var(--muted); margin-bottom:3px; }
input,select,textarea { font:inherit; width:100%; padding:7px 9px; border-radius:7px;
  border:1px solid var(--line); background:var(--field); color:var(--fg); }
textarea { font:12px/1.65 ui-monospace,Menlo,monospace; min-height:260px; resize:vertical; }
.row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.hint { font-size:12px; color:var(--muted); margin:6px 0 0; }
.dirty > summary { box-shadow:inset 3px 0 0 var(--accent); }
</style>
</head>
<body>
<main>
<header>
  <h1>Golden set</h1>
  <span id="status">loading…</span>
  <button id="save" disabled>Save</button>
</header>
<div id="rows"></div>
</main>
<script>
const state = { rows: [], dirty: new Set() };
const el = (id) => document.getElementById(id);

function requirementsToText(requirements) {
  return requirements
    .map((r) => r.priority + ": " + r.anyOf.join(" | "))
    .join("\n");
}

function textToRequirements(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^(must|nice)\s*:\s*(.+)$/i.exec(line);
      if (!match) throw new Error("line " + (index + 1) + ': expected "must: X" or "nice: X | Y"');
      const priority = match[1].toLowerCase();
      const parts = match[2].split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) throw new Error("line " + (index + 1) + ": empty requirement");
      return { priority, anyOf: parts };
    });
}

function render() {
  el("rows").innerHTML = state.rows.map((row, i) => {
    const e = row.expectedOutput;
    return '<details data-i="' + i + '">' +
      '<summary><b>' + escapeHtml(row.input.title) + '</b>' +
      '<span class="tag">' + e.requirements.length + ' reqs · ' + row.metadata.reviewStatus + '</span></summary>' +
      '<div class="cols"><div><h3>Vacancy</h3><div class="vacancy">' + vacancyHtml(row.input.text) + '</div></div>' +
      '<div>' +
        '<div class="row2">' +
          '<label><span>role</span><input data-f="role" value="' + escapeAttr(e.role ?? "") + '"></label>' +
          '<label><span>seniority</span><input data-f="seniority" value="' + escapeAttr(e.seniority ?? "") + '"></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label><span>isTech</span><select data-f="isTech">' +
            '<option value="true"' + (e.isTech ? " selected" : "") + '>true</option>' +
            '<option value="false"' + (e.isTech ? "" : " selected") + '>false</option></select></label>' +
          '<label><span>reviewStatus</span><select data-f="reviewStatus">' +
            ["draft","approved","rejected"].map((s) =>
              '<option' + (row.metadata.reviewStatus === s ? " selected" : "") + '>' + s + '</option>').join("") +
          '</select></label>' +
        '</div>' +
        '<label><span>requirements</span><textarea data-f="requirements">' +
          escapeHtml(requirementsToText(e.requirements)) + '</textarea></label>' +
        '<p class="hint">One per line: <code>must: Python</code> · <code>must: React | Vue.js</code> for a choice. Empty role or seniority means null.</p>' +
      '</div></div></details>';
  }).join("");
}

// Display only: the scraped text is one blob — every row carries two newlines in
// ~5k characters. Sentence-per-line is a reading aid, the stored text is untouched.
function vacancyHtml(text) {
  return text
    .split("\n")
    .filter((block) => block.trim())
    .flatMap((block, blockIndex) =>
      block
        .split(/(?<=[.!?:])\s+(?=[A-ZА-ЯІЇЄҐ0-9🔹✅])/u)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .map((sentence, i) => {
          const heading = /^[A-ZА-ЯІЇЄҐ][A-ZА-ЯІЇЄҐ \-']{3,40}:/u.test(sentence);
          const cls = heading ? "head" : i === 0 && blockIndex > 0 ? "gap" : "";
          return '<p class="' + cls + '">' + escapeHtml(sentence) + "</p>";
        }),
    )
    .join("");
}

function collect() {
  document.querySelectorAll("details").forEach((node) => {
    const row = state.rows[Number(node.dataset.i)];
    const read = (f) => node.querySelector('[data-f="' + f + '"]').value;
    row.expectedOutput.role = read("role").trim() || null;
    row.expectedOutput.seniority = read("seniority").trim() || null;
    row.expectedOutput.isTech = read("isTech") === "true";
    row.metadata.reviewStatus = read("reviewStatus");
    row.expectedOutput.requirements = textToRequirements(read("requirements"));
  });
}

function setStatus(text, kind) {
  el("status").textContent = text;
  el("status").className = kind || "";
}

el("rows").addEventListener("input", (event) => {
  const node = event.target.closest("details");
  node.classList.add("dirty");
  state.dirty.add(node.dataset.i);
  el("save").disabled = false;
  setStatus(state.dirty.size + " row(s) changed");
});

el("save").addEventListener("click", async () => {
  try {
    collect();
  } catch (error) {
    setStatus(error.message, "err");
    return;
  }
  el("save").disabled = true;
  setStatus("saving…");
  const response = await fetch("/dataset", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.rows),
  });
  const body = await response.json();
  if (!response.ok) {
    setStatus(body.error, "err");
    el("save").disabled = false;
    return;
  }
  state.dirty.clear();
  document.querySelectorAll(".dirty").forEach((n) => n.classList.remove("dirty"));
  setStatus("saved " + body.saved + " rows — run pnpm eval", "ok");
});

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
}
const escapeAttr = escapeHtml;

fetch("/dataset").then((r) => r.json()).then((rows) => {
  state.rows = rows;
  render();
  setStatus(rows.length + " rows");
});
</script>
</body>
</html>`;
