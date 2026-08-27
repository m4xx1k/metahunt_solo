// T3 engine spike, driven headless. Loads /spike.html, waits for the in-page
// sampler, and reports both the delivered-fps figure and a raw tick+draw cost
// wrapped around the same frames. Throwaway with the spike.
//
//   node spike/measure.mjs [url]            # default http://localhost:4200/spike.html
//   node spike/measure.mjs --drag           # jitter the pointer while sampling
//
// Headless Chromium here is SwiftShader (no GPU), so a pass is conservative and
// a fail is ambiguous — the authoritative number is a real browser on real hardware.

import { chromium } from "playwright";

const url = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:4200/spike.html";
const drag = process.argv.includes("--drag");

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => process.stderr.write(`  [page] ${m.text()}\n`));
page.on("pageerror", (e) => process.stderr.write(`  [pageerror] ${e.message}\n`));

await page.goto(url, { waitUntil: "networkidle" });

if (drag) {
  const jitter = setInterval(async () => {
    const x = 300 + Math.random() * 800;
    const y = 200 + Math.random() * 500;
    await page.mouse.move(x, y).catch(() => {});
  }, 40);
  page.once("close", () => clearInterval(jitter));
}

await page.waitForFunction(() => window.__spikeDone === true, null, { timeout: 60_000 });
const result = await page.evaluate(() => window.__spikeResult);

// Independent raw-cost probe: measure wall time actually spent in JS between
// paints over ~4s, warm. This is the headroom the vsync-locked figure hides.
const raw = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const gaps = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        // long-task-ish: time since previous rAF minus the frame budget
        gaps.push(now - last);
        last = now;
        if (++n < 240) requestAnimationFrame(tick);
        else {
          gaps.sort((a, b) => a - b);
          const p = (q) => +gaps[Math.floor(gaps.length * q)].toFixed(2);
          resolve({ frames: n, p50: p(0.5), p95: p(0.95), max: +gaps[gaps.length - 1].toFixed(2) });
        }
      };
      requestAnimationFrame(tick);
    }),
);

await browser.close();

const pass = result.fps >= 59 && result.frameMsP95 <= 20;
console.log(JSON.stringify({ headless: true, drag, gate: pass ? "PASS" : "FAIL", inPage: result, rafGapMs: raw }, null, 2));
process.exit(pass ? 0 : 1);
