import type { Neighborhood } from "@/lib/metalab/graph";
import { Panel } from "@/ui/layout/Panel";

const SIZE = 520;
const CENTER = SIZE / 2;
const INNER = 70;
const OUTER = 226;
const MAX_NODES = 18;

// A neighbourhood, not the taxonomy hairball: one focus skill ringed by its
// strongest neighbours. Radius encodes association (closer = stronger), the
// dot encodes how common the skill is, the line encodes how many positions
// actually carry both. Plain SVG — no graph library, no client JS.
export function NeighborGraph({ view }: { view: Neighborhood }) {
  const shown = view.neighbors.slice(0, MAX_NODES);

  if (shown.length === 0) {
    return (
      <Panel title="Neighbourhood">
        <p className="font-mono text-xs text-text-muted">
          No neighbour clears the current support floor in this scope.
        </p>
      </Panel>
    );
  }

  const strengths = shown.map((n) => n.npmi ?? n.pGiven);
  const maxStrength = Math.max(...strengths);
  const minStrength = Math.min(...strengths);
  const span = maxStrength - minStrength || 1;

  const maxPairs = Math.max(...shown.map((n) => n.pairs));
  const maxSupport = Math.max(...shown.map((n) => n.node.support), view.focusSupport);

  const placed = shown.map((n, i) => {
    const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
    const strength = n.npmi ?? n.pGiven;
    // Strongest neighbour sits at the inner ring, weakest at the outer.
    const radius = OUTER - ((strength - minStrength) / span) * (OUTER - INNER);
    return {
      ...n,
      x: CENTER + Math.cos(angle) * radius,
      y: CENTER + Math.sin(angle) * radius,
      dotR: 4 + Math.sqrt(n.node.support / maxSupport) * 9,
      width: 0.6 + (n.pairs / maxPairs) * 3.4,
      opacity: 0.25 + (n.pairs / maxPairs) * 0.5,
      anchor: Math.cos(angle) >= 0 ? ("start" as const) : ("end" as const),
      labelDx: Math.cos(angle) >= 0 ? 10 : -10,
    };
  });

  return (
    <Panel
      title="Neighbourhood"
      meta={`${view.focus.name} · ${view.scopeLabel} · n=${view.denominator.toLocaleString("en-US")}`}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto h-auto w-full max-w-[560px]"
          role="img"
          aria-label={`Strongest observed co-requirements of ${view.focus.name} in ${view.scopeLabel}`}
        >
          {placed.map((n) => (
            <line
              key={`e-${n.node.id}`}
              x1={CENTER}
              y1={CENTER}
              x2={n.x}
              y2={n.y}
              stroke="currentColor"
              strokeWidth={n.width}
              className="text-text-muted"
              opacity={n.opacity}
            />
          ))}

          {placed.map((n) => (
            <g key={`n-${n.node.id}`}>
              <circle cx={n.x} cy={n.y} r={n.dotR} className="fill-text-muted" opacity={0.85} />
              <text
                x={n.x + n.labelDx}
                y={n.y + 3}
                textAnchor={n.anchor}
                className="fill-text-primary font-mono text-[10px]"
              >
                {n.node.name}
              </text>
              <text
                x={n.x + n.labelDx}
                y={n.y + 14}
                textAnchor={n.anchor}
                className="fill-text-muted font-mono text-[9px]"
              >
                {n.pairs} · {n.pGiven.toFixed(2)}
              </text>
            </g>
          ))}

          <circle
            cx={CENTER}
            cy={CENTER}
            r={26}
            className="fill-bg stroke-text-primary"
            strokeWidth={1.5}
          />
          <text
            x={CENTER}
            y={CENTER + 3}
            textAnchor="middle"
            className="fill-text-primary font-mono text-[11px] font-bold"
          >
            {view.focus.name}
          </text>
        </svg>
      </div>

      <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-muted">
        Closer = stronger association ({view.neighbors[0]?.npmi === undefined ? "P(B|A)" : "NPMI"}).
        Dot size = how common the skill is overall. Line weight = positions carrying both. Labels
        show pair positions and P(neighbour | {view.focus.name}).
      </p>
    </Panel>
  );
}
