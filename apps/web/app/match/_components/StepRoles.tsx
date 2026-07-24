"use client";

import { CheckSquareIcon, SquareIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

import { MOCK_ROLE_SUGGESTIONS } from "./_mocks";

// Roles step — top-5 suggested roles with an honest covered/total numerator.
// Currently rendered from _mocks.ts (the role-suggestions endpoint is a
// separate backend PR); selection is local state and does not yet filter the
// feed, hence the "попередня оцінка" framing.
export function StepRoles({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Ось де твої навички реально потрібні. Обери ролі — цифри показують, скільки вакансій ролі
        вже підходять тобі.
      </p>

      <div className="flex flex-col gap-2">
        {MOCK_ROLE_SUGGESTIONS.map((role) => {
          const active = selected.has(role.slug);
          const pct = Math.round((role.goodCount / role.totalCount) * 100);
          return (
            <button
              key={role.roleId}
              type="button"
              onClick={() => onToggle(role.slug)}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-2 border p-3.5 text-left transition-colors sm:p-4",
                active ? "border-accent bg-accent/5" : "border-border hover:border-text-secondary",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  {active ? (
                    <CheckSquareIcon
                      weight="fill"
                      className="h-5 w-5 shrink-0 text-accent"
                      aria-hidden
                    />
                  ) : (
                    <SquareIcon className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
                  )}
                  <span className="truncate font-display text-base font-bold text-text-primary">
                    {role.name}
                  </span>
                  {role.pinned ? (
                    <span className="shrink-0 border border-border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      з CV
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs",
                    active ? "text-accent" : "text-text-secondary",
                  )}
                >
                  {role.goodCount} із {role.totalCount}
                </span>
              </span>
              <span className="block h-1.5 w-full bg-border" aria-hidden>
                <span
                  className={cn("block h-full", active ? "bg-accent" : "bg-border-strong")}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {pct}% вакансій ролі підходять тобі
              </span>
            </button>
          );
        })}
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-muted">
        попередня оцінка за ринком · точний підрахунок за твоїм профілем — скоро
      </p>
    </div>
  );
}
