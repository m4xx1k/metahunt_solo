import { panel, panelHead, panelTitle } from "../ui";

export function Faq() {
  return (
    <div className="grid gap-5">
      <section className={panel}>
        <div className={panelHead}>
          <h2 className={panelTitle}>What is a position?</h2>
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed text-ink-2">
          One canonical vacancy. Reposts on different job boards are counted once, so the map describes
          observed hiring demand rather than reposting habits.
        </p>
      </section>
      <section className={panel}>
        <div className={panelHead}>
          <h2 className={panelTitle}>What does “asked alongside” mean?</h2>
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed text-ink-2">
          It is a conditional share: among positions that explicitly require one skill, the share that
          also explicitly require the other. It is an observation, not causation or a learning plan.
        </p>
      </section>
      <section className={panel}>
        <div className={panelHead}>
          <h2 className={panelTitle}>Why do some pairs say “choose one”?</h2>
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed text-ink-2">
          The relation labels are manually reviewed. SUBSTITUTE means the vacancy meant “or”; the
          numbers alone cannot distinguish that from a pair where both skills are genuinely needed.
        </p>
      </section>
      <section className={panel}>
        <div className={panelHead}>
          <h2 className={panelTitle}>What are the limits?</h2>
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed text-ink-2">
          This is a fixed snapshot of two job boards over roughly fourteen weeks, not a live market.
          The REQUIRED/optional extraction has not yet been measured against a golden set, so these
          figures remain research evidence rather than user-specific advice.
        </p>
      </section>
    </div>
  );
}
