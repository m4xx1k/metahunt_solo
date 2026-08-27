// T4 behaviour check for the constellation, driven headless.
//
//   pnpm --filter @metahunt/lab lab        # dev server on :4200, in another shell
//   node spike/measure.mjs                 # default http://localhost:4200/
//
// Three gates from the migration tracker:
//   - clicking a drifting node selects it on the FIRST click (no dead click)
//   - dragging the NPMI slider never blocks the main thread
//   - the warm simulation still holds ~60 fps at the default threshold
//
// Headless Chromium is SwiftShader (no GPU): a pass is conservative.

import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4200/";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => process.stderr.write(`  [pageerror] ${e.message}\n`));

await page.goto(url, { waitUntil: "networkidle" });

// Wait for the map to mount and the sim to have positions.
await page.waitForFunction(
  () => {
    const ns = window.__fgNodes;
    return window.__fg && Array.isArray(ns) && ns.some((n) => Number.isFinite(n.x));
  },
  null,
  { timeout: 30_000 },
);
await page.waitForTimeout(2000); // let it settle a little

const canvas = page.locator("canvas").first();
const box = await canvas.boundingBox();
const queryInput = page.locator("#skill-query");

// --- gate 1: click lands first time -------------------------------------
// The regression this guards: a dead first click right after the view rebuilds
// (the old sigma map tore down and recreated its renderer on every filter
// change, so the click after one was swallowed). Each trial perturbs the view,
// parks one node dead-centre with centerAt+zoom, then does exactly ONE click at
// the canvas centre — no screen-coordinate mapping to get wrong.

const cx = () => box.x + box.width / 2;
const cy = () => box.y + box.height / 2;

const mouseOut = async () => {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 40);
  await page.waitForTimeout(250);
};

const setNpmi = async (v) => {
  await page.locator("#npmi").evaluate((el, val) => {
    el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await page.waitForTimeout(700);
};

let firstClickHits = 0;
let trials = 0;
const clickLog = [];
const rounds = [
  { how: "cold", pre: async () => {} },
  { how: "after npmi 0.30->0.50", pre: () => setNpmi("0.5") },
  { how: "after npmi 0.50->0.30", pre: () => setNpmi("0.3") },
  { how: "after cluster picked", pre: async () => {
      await page.locator("#cluster").selectOption({ index: 1 });
      await page.waitForTimeout(700);
    } },
];

for (let r = 0; r < rounds.length; r++) {
  await mouseOut();
  await rounds[r].pre();
  await mouseOut();

  // Enter the canvas first so the sim freezes, THEN park a node dead-centre —
  // otherwise it drifts out of the middle during the camera settle.
  await page.mouse.move(cx(), cy());
  await page.waitForTimeout(400); // hover-freeze settles
  const target = await page.evaluate((rank) => {
    const ns = window.__fgNodes
      .filter((n) => Number.isFinite(n.x))
      .sort((a, b) => b.deg - a.deg);
    const n = ns[rank];
    if (!n) return null;
    window.__fg.centerAt(n.x, n.y, 250);
    window.__fg.zoom(6, 250);
    return n.name;
  }, r);
  if (!target) {
    clickLog.push({ round: rounds[r].how, skipped: "no node" });
    continue;
  }
  await page.waitForTimeout(650); // camera settle

  trials++;
  const before = await queryInput.getAttribute("placeholder");
  // jiggle to force a pointermove onto the centred node
  await page.mouse.move(cx() - 8, cy() - 8);
  await page.waitForTimeout(120);
  await page.mouse.move(cx(), cy(), { steps: 4 });
  await page.waitForTimeout(250);
  let cursor = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).cursor);
  if (cursor !== "pointer") {
    // spiral out a little to find the node's exact centre
    for (const [dx, dy] of [[6, 0], [-6, 6], [0, -8], [10, 10], [-12, 0]]) {
      await page.mouse.move(cx() + dx, cy() + dy, { steps: 2 });
      await page.waitForTimeout(120);
      cursor = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).cursor);
      if (cursor === "pointer") break;
    }
  }
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(450);
  const after = await queryInput.getAttribute("placeholder");
  const hit = after === target && after !== before;
  if (hit) firstClickHits++;
  clickLog.push({ round: rounds[r].how, target, was: before, got: after, cursorWasPointer: cursor === "pointer", hit });
}
await page.locator("#cluster").selectOption({ index: 0 });
await mouseOut();

// --- gate 2: NPMI slider never blocks ------------------------------------
const slider = page.locator("#npmi");
await slider.scrollIntoViewIfNeeded();
const sBox = await slider.boundingBox();

// Start sampling long-frame gaps, then sweep the slider under the pointer.
await page.evaluate(() => {
  window.__gaps = [];
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    window.__gaps.push(now - last);
    last = now;
    window.__gapRAF = requestAnimationFrame(loop);
  };
  window.__gapRAF = requestAnimationFrame(loop);
});

await page.mouse.move(sBox.x + 4, sBox.y + sBox.height / 2);
await page.mouse.down();
for (let i = 0; i <= 20; i++) {
  await page.mouse.move(sBox.x + 4 + (sBox.width - 8) * (i / 20), sBox.y + sBox.height / 2);
  await page.waitForTimeout(60);
}
await page.mouse.up();
await page.waitForTimeout(400);

const gaps = await page.evaluate(() => {
  cancelAnimationFrame(window.__gapRAF);
  const g = window.__gaps.slice(5).sort((a, b) => a - b);
  return {
    p50: +g[Math.floor(g.length * 0.5)].toFixed(1),
    p95: +g[Math.floor(g.length * 0.95)].toFixed(1),
    max: +g[g.length - 1].toFixed(1),
    n: g.length,
  };
});

// --- gate 3: warm fps at default threshold -----------------------------
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const ts = [];
      const tick = () => {
        ts.push(performance.now());
        if (ts.length < 240) requestAnimationFrame(tick);
        else resolve(+(((ts.length - 1) / (ts.at(-1) - ts[0])) * 1000).toFixed(1));
      };
      requestAnimationFrame(tick);
    }),
);

await browser.close();

const pass = trials > 0 && firstClickHits === trials && gaps.max < 120 && fps >= 55;
console.log(
  JSON.stringify(
    {
      gate: pass ? "PASS" : "FAIL",
      clickLandsFirstTime: `${firstClickHits}/${trials}`,
      clicks: clickLog,
      sliderDragGapMs: gaps,
      warmFps: fps,
    },
    null,
    2,
  ),
);
process.exit(pass ? 0 : 1);
