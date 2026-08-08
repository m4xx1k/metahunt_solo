import Link from "next/link";

import { graph, type MetalabNode, type MetalabRole, type SortMetric } from "@/lib/metalab/graph";
import { cn } from "@/lib/utils";
import { Panel } from "@/ui/layout/Panel";

const SORT_LABELS: Record<SortMetric, string> = {
  npmi: "NPMI",
  lift: "lift",
  pairs: "pair count",
  conditional: "P(B|A)",
};

const PAIR_FLOORS = [10, 25, 50, 100];

// Role conditioning is the point of this panel, not a nicety: Backend Engineer
// alone is ~18% of the corpus, so a global edge can be pure role composition.
export function Controls({
  role,
  sort,
  minPairs,
  focus,
}: {
  role: MetalabRole | null;
  sort: SortMetric;
  minPairs: number;
  focus: MetalabNode;
}) {
  const base = { skill: focus.slug ?? focus.name };
  const link = (extra: Record<string, string | number | undefined>) => ({
    pathname: "/dashboard/metalab",
    query: Object.fromEntries(
      Object.entries({ ...base, role: role?.id, sort, minPairs, ...extra }).filter(
        ([, v]) => v !== undefined && v !== "",
      ),
    ),
  });

  return (
    <Panel title="Scope">
      <Group label="Role segment">
        <Chip href={link({ role: undefined })} active={!role}>
          all roles · {graph.provenance.nPositions.toLocaleString("en-US")}
        </Chip>
        {graph.roles.map((r) => (
          <Chip key={r.id} href={link({ role: r.id })} active={role?.id === r.id}>
            {r.name} · {r.positions.toLocaleString("en-US")}
          </Chip>
        ))}
      </Group>

      <Group label="Sort by">
        {(Object.keys(SORT_LABELS) as SortMetric[]).map((s) => (
          <Chip
            key={s}
            href={link({ sort: s })}
            active={sort === s}
            disabled={!!role && s === "npmi"}
          >
            {SORT_LABELS[s]}
          </Chip>
        ))}
      </Group>

      <Group label="Min pair positions">
        {PAIR_FLOORS.map((f) => (
          <Chip key={f} href={link({ minPairs: f })} active={minPairs === f}>
            ≥ {f}
          </Chip>
        ))}
      </Group>

      {role ? (
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-text-muted">
          Inside a role segment NPMI is not carried by the artifact — sorting falls back to lift.
          Role edges are recomputed from that role&apos;s own denominator ({role.positions}), so
          they are comparable to each other, not to the global column.
        </p>
      ) : null}
    </Panel>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  href,
  active,
  disabled,
  children,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-text-muted/40">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "rounded border px-2 py-0.5 font-mono text-[11px]",
        active
          ? "border-text-primary text-text-primary"
          : "border-border text-text-muted hover:text-text-primary",
      )}
    >
      {children}
    </Link>
  );
}
