import { graph } from "@/lib/metalab/graph";
import { Panel } from "@/ui/layout/Panel";

// The limitations panel is not boilerplate — it is the deliverable. A research
// tool that hides its denominator is a marketing dashboard.
export function Methodology() {
  const { contract, provenance, sensitivity, sources } = graph;
  const unionDelta =
    ((sensitivity.unionSkillLinks - sensitivity.repSkillLinks) / sensitivity.repSkillLinks) * 100;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Analytical contract">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
          <Row k="grain" v={contract.grain} />
          <Row
            k="denominator"
            v={`${provenance.nPositions.toLocaleString("en-US")} positions with ≥1 eligible skill`}
          />
          <Row k="position skill rule" v={contract.positionSkillRule} />
          <Row k="skill eligibility" v={contract.skillEligibility} />
          <Row k="requirement layer" v={contract.requirementLayer} />
          <Row k="min skill support" v={`${contract.minSkillSupport} positions`} />
          <Row k="min pair support" v={`${contract.minPairSupport} positions`} />
          <Row k="liveness claim" v={contract.livenessClaim} />
          <Row k="corpus" v={`${provenance.corpusStart} → ${provenance.corpusEnd}`} />
          <Row k="snapshot" v={provenance.snapshot} />
          <Row
            k="sources"
            v={sources.map((s) => `${s.code} ${s.positions.toLocaleString("en-US")}`).join(" · ")}
          />
          <Row k="built by" v={provenance.experiment} />
          <Row k="issue" v={provenance.issue} />
        </dl>
      </Panel>

      <Panel title="What this cannot tell you">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed text-text-muted">
          <li>
            <strong className="text-text-primary">Nothing causal.</strong> An edge says two skills
            are required together more often than their separate prevalences predict. It does not
            say learning one helps you get hired for the other.
          </li>
          <li>
            <strong className="text-text-primary">Nothing about the market.</strong> The corpus is
            two boards over ~14 weeks. Source composition is not a random sample of anything.
          </li>
          <li>
            <strong className="text-text-primary">Nothing about liveness.</strong> No field here can
            observe whether a position is still open, so no &ldquo;active demand&rdquo; reading is
            supported.
          </li>
          <li>
            <strong className="text-text-primary">No trends.</strong> 14 weeks cannot carry a
            time-series claim, and the first weeks are catch-up ingestion.
          </li>
          <li>
            <strong className="text-text-primary">Skills are measured, not observed.</strong> An LLM
            extractor decides what counts as required. No golden set validates that split yet, so
            required-vs-optional inherits its error.
          </li>
          <li>
            <strong className="text-text-primary">Substitutes look like complements.</strong> Two
            competing technologies listed in the same posting score high. TensorFlow/PyTorch is an
            association, not a stack.
          </li>
        </ul>
      </Panel>

      <Panel title="Robustness — representative vs member union" className="lg:col-span-2">
        <p className="text-xs leading-relaxed text-text-muted">
          A canonical position can have several source postings whose extractions disagree. The
          baseline uses the representative member only; the union arm takes every member&apos;s
          required skills. Union adds{" "}
          <strong className="text-text-primary">{unionDelta.toFixed(1)}%</strong> more skill links (
          {sensitivity.repSkillLinks.toLocaleString("en-US")} →{" "}
          {sensitivity.unionSkillLinks.toLocaleString("en-US")}) and{" "}
          <strong className="text-text-primary">{sensitivity.unionOnlyEdges}</strong> edges the
          baseline lacks, while removing{" "}
          <strong className="text-text-primary">{sensitivity.repOnlyEdges}</strong>. Across the{" "}
          {graph.edges.length.toLocaleString("en-US")} shared edges the NPMI rank correlation is ρ =
          0.998. The aggregation rule is therefore <em>not</em> a meaningful analytical parameter at
          this corpus&apos;s deduplication rate — 88% of positions have a single member, so there is
          little for the rules to disagree about.
        </p>
      </Panel>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-text-primary">{v}</dd>
    </>
  );
}
