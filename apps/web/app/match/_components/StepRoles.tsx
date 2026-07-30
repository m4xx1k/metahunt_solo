"use client";

import { CheckSquareIcon, SquareIcon } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import { cn } from "@/lib/utils";

const MANUAL_ROLE_LIMIT = 8;

export function StepRoles({
  candidateId,
  selected,
  onToggle,
}: {
  candidateId: string | null;
  selected: Set<string>;
  onToggle: (roleId: string) => void;
}) {
  const suggestions = useQuery({
    queryKey: ["cv", candidateId, "role-suggestions"],
    queryFn: () => cvApi.roleSuggestions(candidateId as string),
    enabled: candidateId != null,
  });
  const catalog = useQuery({
    queryKey: ["roles-catalog"],
    queryFn: () => facetsApi.roles(),
    enabled: candidateId == null,
  });
  const roles = suggestions.data?.items ?? [];
  const manualRoles = catalog.data?.roles.slice(0, MANUAL_ROLE_LIMIT) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Обери ролі, які хочеш бачити. Після вибору інші ролі не потраплять у твою добірку.
      </p>

      {candidateId == null && catalog.isLoading ? (
        <p className="font-mono text-xs text-text-muted">завантажуємо ролі…</p>
      ) : candidateId == null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {manualRoles.map((role) => {
            const active = selected.has(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onToggle(role.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between gap-3 border p-3 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-text-secondary",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {active ? (
                    <CheckSquareIcon
                      weight="fill"
                      className="h-5 w-5 shrink-0 text-accent"
                      aria-hidden
                    />
                  ) : (
                    <SquareIcon className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
                  )}
                  <span className="truncate font-display text-sm font-bold text-text-primary">
                    {role.name}
                  </span>
                </span>
                <span className="font-mono text-2xs text-text-muted">{role.count}</span>
              </button>
            );
          })}
        </div>
      ) : suggestions.isLoading ? (
        <p className="font-mono text-xs text-text-muted">рахуємо ролі за твоїми навичками…</p>
      ) : roles.length === 0 ? (
        <p className="border border-border bg-bg px-4 py-3 font-mono text-xs text-text-muted">
          Поки не знайшли роль з достатньою кількістю збігів — додай навички або пропусти цей крок.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {roles.map((role) => {
            const roleRef = role.slug ?? role.roleId;
            const active = selected.has(roleRef);
            const pct = Math.round((role.goodCount / role.totalCount) * 100);
            return (
              <button
                key={role.roleId}
                type="button"
                onClick={() => onToggle(roleRef)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col gap-2 border p-3.5 text-left transition-colors sm:p-4",
                  active
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-text-secondary",
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
      )}

      {candidateId ? (
        <p className="font-mono text-[10px] leading-relaxed text-text-muted">
          цифри — частка вакансій ролі, що підходять за навичками
        </p>
      ) : null}
    </div>
  );
}
