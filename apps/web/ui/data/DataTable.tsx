import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

// Declarative table for the console's data screens. Columns own their own
// rendering, so pages stop hand-writing thead/tbody markup per screen; the
// horizontal scroll is contained here instead of leaking to the page.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 960,
  empty = "no rows",
  className,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  minWidth?: number;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="font-mono text-xs text-text-muted">{empty}</p>;
  }

  return (
    <div className={cn("-mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full border-collapse text-left font-mono text-xs" style={{ minWidth }}>
        <thead className="text-2xs uppercase tracking-[0.12em] text-text-muted">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn("pb-3 pr-4 font-normal", col.align === "right" && "pr-0 text-right")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border/60 align-top">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "py-3 pr-4 text-text-secondary",
                    col.align === "right" && "pr-0 text-right tabular-nums",
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
