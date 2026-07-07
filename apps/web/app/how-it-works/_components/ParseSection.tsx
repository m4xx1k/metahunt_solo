import { Callout } from "./Callout";
import { ExtLink } from "./ExtLink";
import { parse } from "./data";
import { Panel } from "./Panel";
import { StageHead } from "./StageHead";
import { SubStats } from "./SubStats";

// One line of the extracted JSON, as key/value segments so key and value can
// carry different syntax-highlight colours without fragile string splicing.
const JSON_LINES: { key: string; value: string; str?: boolean }[] = [
  { key: "seniority", value: '"senior"', str: true },
  { key: "role", value: '"backend"', str: true },
  { key: "required", value: '["Go","PostgreSQL","Kafka"]', str: true },
  { key: "optional", value: '["gRPC"]', str: true },
  { key: "experienceYears", value: "5" },
  { key: "salary", value: '{ "min": 6000, "max": 8000 }' },
  { key: "workFormat", value: '"remote"', str: true },
  { key: "hasTestAssignment", value: "true" },
];

export function ParseSection() {
  return (
    <section id="parse" className="scroll-mt-24 border-t border-border py-14">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start">
        <div>
          <StageHead num="02" title="parse" />
          <SubStats items={parse.substats} />
          <p className="mb-3.5 font-body text-sm leading-[1.6] text-text-secondary">
            A job post is unstructured prose. We hand the full text to{" "}
            <ExtLink href="https://www.deepseek.com">DeepSeek</ExtLink> (
            <code className="bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
              deepseek-v4-flash
            </code>
            , reasoning disabled for speed &amp; cost) through{" "}
            <ExtLink href="https://www.boundaryml.com">BAML</ExtLink> — a typed schema language
            for LLM calls that validates and retries until the model returns exactly the shape we
            asked for.
          </p>
          <ul className="mb-3.5 list-disc space-y-1.5 pl-5 font-body text-sm leading-[1.5] text-text-secondary marker:text-border-strong">
            {parse.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Callout>
            <span className="font-mono font-bold text-accent">Why BAML?</span> It turns
            &ldquo;prompt an LLM and hope the JSON parses&rdquo; into a typed function call with
            schema validation and automatic retries — the structure is guaranteed, not
            best-effort.
            <span className="mt-1.5 block font-mono text-2xs text-text-muted">
              per-token pricing verified in code; per-vacancy cost is a fraction of a cent
              (estimate).
            </span>
          </Callout>
        </div>

        <Panel label="raw text → structured (via BAML)">
          <div className="border border-border bg-bg p-2.5 font-mono text-2xs leading-[1.55] text-text-secondary">
            Шукаємо <span className="text-accent">Senior Golang</span> інженера. Досвід від 5
            років. <span className="text-accent-secondary">Go, PostgreSQL, Kafka</span>, буде
            плюсом gRPC. <span className="text-success">Remote</span>, вилка{" "}
            <span className="text-success">$6000–8000</span>. Тестове завдання.
          </div>
          <div className="my-2.5 text-center font-mono text-xs font-bold text-accent">
            ↓ deepseek · ExtractVacancy()
          </div>
          <div className="border border-border-strong bg-bg p-3 font-mono text-2xs leading-[1.6] text-text-muted">
            <div>{"{"}</div>
            {JSON_LINES.map((line, i) => (
              <div key={line.key} className="pl-4">
                <span className="text-accent-secondary">&quot;{line.key}&quot;</span>
                {": "}
                <span className={line.str ? "text-success" : "text-accent"}>{line.value}</span>
                {i < JSON_LINES.length - 1 ? "," : ""}
              </div>
            ))}
            <div>{"}"}</div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
