import { useMemo, useState } from "react";
import raw from "../data/experiments/domain-axes.json";
import type { DomainAxes } from "../data/experiments/types";
import { fmt } from "../lib/graph";
import { BubbleChart } from "../charts/BubbleChart";
import { input, label, panel, panelHead, panelNote, panelTitle } from "../ui";

const axes = raw as unknown as DomainAxes;

const magStyle = (share: number) => ({ ["--mag" as string]: `${Math.max(0, Math.min(1, share)) * 100}%` });

/** Sandbox for MET-143: domain / role cross-axes, and a first-pass
 *  track-worthiness table (support only — distinctiveness and overlap are
 *  not built yet). Not in the default tab bar on purpose: reach it via
 *  #experiments. Bars reuse the app's existing `.mag` magnitude idiom (see
 *  index.css) rather than adding new series colors.
 *
 *  Cut after review, 2026-08-09: seniority-skew-by-role (no significance
 *  test on ~20-position buckets, and disconnected from the track-worthiness
 *  goal) and the two work-format tables (not interesting enough to earn a
 *  section). Removed from the export too — see pipeline/06-export-domain-axes.sql. */
export function Experiments() {
  const domainSizes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of axes.domainSkill) seen.set(d.domain, d.domainPositions);
    for (const d of axes.domainRole) seen.set(d.domain, d.domainPositions);
    return [...seen.entries()].map(([domain, positions]) => ({ domain, positions })).sort((a, b) => b.positions - a.positions);
  }, []);

  const domains = domainSizes.map((d) => d.domain);
  const [domain, setDomain] = useState(domains[0] ?? "");

  const domainRoles = axes.domainRole.filter((r) => r.domain === domain);
  const domainSkills = axes.domainSkill.filter((s) => s.domain === domain);
  const maxRolePositions = Math.max(1, ...domainRoles.map((r) => r.positions));

  const tracksBySupport = useMemo(() => [...axes.trackProfile].sort((a, b) => b.support - a.support), []);
  const maxTrackSupport = tracksBySupport[0]?.support ?? 1;

  return (
    <>
      <div className="mb-5 rounded-lg border border-trap bg-trap-soft px-4 py-3 text-xs leading-relaxed text-ink-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-wider text-trap">
          Unreviewed sandbox — MET-143
        </p>
        <p className="mt-1 max-w-[72ch]">
          {axes.contract.status}. Built from {fmt(axes.provenance.positions)} positions (
          {axes.provenance.domainFillPct}% carry a domain). Domain is extractor output with the same
          unvalidated status as everything else in the lab (MET-24) — read as a hint, not a finding, and
          never as advice on which track to hide.
        </p>
      </div>

      <div className={`${panel} mb-5`}>
        <div className={panelHead}>
          <span className={panelTitle}>Domain size</span>
          <span className={panelNote}>area &prop; positions, floor {axes.contract.minDomainPositions}</span>
        </div>
        <BubbleChart items={domainSizes.map((d) => ({ label: d.domain, value: d.positions }))} />
      </div>

      <div className={`${panel} mb-5`}>
        <div className={panelHead}>
          <span className={panelTitle}>Track worthiness — support only (v0)</span>
          <span className={panelNote}>
            floor {axes.contract.minTrackSupport}, same as the skill graph &middot; distinctiveness and
            overlap are not built yet — this is one axis of the rubric, not a verdict
          </span>
        </div>
        <div className="max-h-[26rem] overflow-y-auto p-1">
          {tracksBySupport.map((t) => (
            <div key={t.slug} className="flex items-center gap-3 px-3 py-1">
              <span className="w-40 shrink-0 truncate text-right font-mono text-[0.76rem] text-ink-2" title={t.label}>
                {t.slug}
              </span>
              <div
                className="mag h-[14px] flex-1"
                data-weak={!t.floorOk}
                style={magStyle(t.support / maxTrackSupport)}
              >
                <span className={`pl-2 font-mono text-[0.72rem] ${t.floorOk ? "text-ink-3" : "text-trap"}`}>
                  {fmt(t.support)}
                </span>
              </div>
              <span className="w-28 shrink-0 truncate text-[0.7rem] text-ink-3">{t.topDomain ?? "—"}</span>
            </div>
          ))}
        </div>
        <p className="border-t border-rule px-4 py-2 text-[0.7rem] text-ink-3">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-trap-soft align-middle" /> below the
          support floor — read with caution, not "hide this"
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-1">
        <label className={label} htmlFor="domain-pick">
          Domain
        </label>
        <select id="domain-pick" className={input} value={domain} onChange={(e) => setDomain(e.target.value)}>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={panel}>
          <div className={panelHead}>
            <span className={panelTitle}>Role mix in {domain}</span>
          </div>
          <div className="p-1">
            {domainRoles.map((r) => (
              <div key={r.role} className="flex items-center gap-3 px-3 py-1">
                <span className="w-32 shrink-0 truncate text-right text-[0.8rem] text-ink-2">{r.role}</span>
                <div className="mag h-[14px] flex-1" style={magStyle(r.positions / maxRolePositions)}>
                  <span className="pl-2 font-mono text-[0.72rem] text-ink-3">{fmt(r.positions)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={panel}>
          <div className={panelHead}>
            <span className={panelTitle}>Defining skills in {domain}</span>
            <span className={panelNote}>required-only, floor {axes.contract.minDomainSkillSupport}</span>
          </div>
          <div className="p-1">
            {domainSkills.map((s) => (
              <div key={s.skill} className="flex items-center gap-3 px-3 py-1">
                <span className="w-32 shrink-0 truncate text-right text-[0.8rem] text-ink-2">{s.skill}</span>
                <div className="mag h-[14px] flex-1" style={magStyle(s.pct / 100)}>
                  <span className="pl-2 font-mono text-[0.72rem] text-ink-3">{s.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
