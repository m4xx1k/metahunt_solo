"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";

import { taxonomyApi, type MapNodeItem, type NodeKind } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { VerifiedSearch } from "../../_components/VerifiedSearch";

// Tile side ∝ sqrt(df): the grid is 46px square cells and each tile spans
// ceil(sqrt(df) / DIVISOR) cells each way. Clamped to [2, 4] — the min keeps
// every tile's label readable (a 1-cell tile is an unlabelled dot), the max
// stops the busiest node from eating the screen and flattens the top handful
// of nodes into one "big" bucket, which is all the curator needs from size.
// `grid-auto-flow: dense` back-fills the gaps the big tiles leave.
const CELL_PX = 46;
const SPAN_DIVISOR = 7;
const MIN_SPAN = 2;
const MAX_SPAN = 4;
const BIG_SPAN = 3;

const KIND_CYCLE: Record<string, NodeKind | null> = {
  TECH: "CONCEPT",
  CONCEPT: null,
  SOFT: "TECH",
  null: "TECH",
};

const KIND_STYLE: Record<string, string> = {
  TECH: "border-accent text-accent",
  CONCEPT: "border-accent-secondary text-accent-secondary",
  SOFT: "border-success text-success",
  null: "border-border text-text-muted",
};

function nextKind(kind: NodeKind | null): NodeKind | null {
  return KIND_CYCLE[kind ?? "null"];
}

function tileSpan(df: number): number {
  return Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.ceil(Math.sqrt(df) / SPAN_DIVISOR)));
}

// A real kind on a HIDDEN node also un-hides it (the API verifies it server-side);
// mirror that locally so the dashed border clears on the same click.
function kindPatch(node: MapNodeItem, kind: NodeKind | null): Partial<MapNodeItem> {
  return kind !== null && node.status === "HIDDEN" ? { kind, status: "VERIFIED" } : { kind };
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-2 w-2 border", className)} />
      {label}
    </span>
  );
}

export function TileGrid({ tiles }: { tiles: MapNodeItem[] }) {
  const router = useRouter();
  // Local, optimistic copy. Not re-synced from `tiles` on router.refresh() — the
  // click already moved the tile and a re-sync would fight the optimism; a track
  // or size change remounts this component (keyed in the page) with fresh data.
  const [items, setItems] = useState<MapNodeItem[]>(tiles);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<MapNodeItem | null>(null);

  const classified = useMemo(() => items.filter((n) => n.kind !== null).length, [items]);

  const patchLocal = useCallback((id: string, patch: Partial<MapNodeItem>) => {
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const run = useCallback(
    async (node: MapNodeItem, patch: Partial<MapNodeItem>, fn: () => Promise<unknown>) => {
      setBusyId(node.id);
      setError(null);
      patchLocal(node.id, patch);
      try {
        await fn();
        router.refresh();
      } catch (e: unknown) {
        patchLocal(node.id, node);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [patchLocal, router],
  );

  const cycleKind = useCallback(
    (node: MapNodeItem) => {
      const target = nextKind(node.kind);
      void run(node, kindPatch(node, target), () => taxonomyApi.setKind(node.id, target));
    },
    [run],
  );

  const setSoft = useCallback(
    (node: MapNodeItem) => {
      void run(node, kindPatch(node, "SOFT"), () => taxonomyApi.setKind(node.id, "SOFT"));
    },
    [run],
  );

  const hideNode = useCallback(
    (node: MapNodeItem) => {
      void run(node, { status: "HIDDEN" }, () => taxonomyApi.hide(node.id));
    },
    [run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hoverId) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const node = items.find((n) => n.id === hoverId);
      if (!node) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        setSoft(node);
      } else if (key === "h") {
        e.preventDefault();
        hideNode(node);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hoverId, items, setSoft, hideNode]);

  const handleTileClick = (node: MapNodeItem) => (e: ReactMouseEvent) => {
    if (e.shiftKey) {
      setMergeSource(node);
      return;
    }
    cycleKind(node);
  };
  const handleTileEnter = (id: string) => () => setHoverId(id);
  const handleGridLeave = useCallback(() => setHoverId(null), []);
  const handleDismissError = useCallback(() => setError(null), []);
  const handleCloseMerge = useCallback(() => setMergeSource(null), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-2xs text-text-muted">
        <span className="text-text-secondary">
          classified {classified} / {items.length}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <LegendDot className="border-accent" label="tech" />
          <LegendDot className="border-accent-secondary" label="concept" />
          <LegendDot className="border-success" label="soft" />
          <LegendDot className="border-border" label="unset" />
          <span>click cycle · s soft · h hide · shift+click merge</span>
        </span>
      </div>

      {error ? (
        <button
          type="button"
          onClick={handleDismissError}
          className="border border-danger bg-bg p-2 text-left font-mono text-2xs text-danger hover:bg-danger hover:text-bg"
        >
          {error} · dismiss
        </button>
      ) : null}

      {items.length === 0 ? (
        <p className="font-mono text-xs text-text-muted">no tiles — pick a track</p>
      ) : (
        <div
          onMouseLeave={handleGridLeave}
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${CELL_PX}px)`,
            gridAutoRows: `${CELL_PX}px`,
            gridAutoFlow: "dense",
          }}
        >
          {items.map((node) => {
            const span = tileSpan(node.df);
            return (
              <button
                key={node.id}
                type="button"
                disabled={busyId === node.id}
                onMouseEnter={handleTileEnter(node.id)}
                onClick={handleTileClick(node)}
                title={`${node.name} · df ${node.df}${node.aliasCount ? ` · ${node.aliasCount} alias` : ""}`}
                style={{ gridColumn: `span ${span}`, gridRow: `span ${span}` }}
                className={cn(
                  "flex min-w-0 flex-col items-start justify-between overflow-hidden border bg-bg-card p-1 text-left font-mono transition-colors disabled:opacity-50",
                  KIND_STYLE[node.kind ?? "null"],
                  node.status === "HIDDEN" && "border-dashed",
                  hoverId === node.id && "bg-bg-elev",
                )}
              >
                <span
                  className={cn(
                    "line-clamp-4 w-full break-words leading-tight",
                    span >= BIG_SPAN ? "text-xs" : "text-2xs",
                  )}
                >
                  {node.name}
                </span>
                <span className="text-2xs text-text-muted">{node.df}</span>
              </button>
            );
          })}
        </div>
      )}

      {mergeSource ? (
        <div className="flex flex-col gap-2 border border-accent bg-bg-elev p-3">
          <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-text-muted">
            <span>merge &quot;{mergeSource.name}&quot; into…</span>
            <button
              type="button"
              onClick={handleCloseMerge}
              className="text-text-secondary hover:text-accent"
            >
              close
            </button>
          </div>
          <VerifiedSearch sourceId={mergeSource.id} type="SKILL" />
        </div>
      ) : null}
    </div>
  );
}
