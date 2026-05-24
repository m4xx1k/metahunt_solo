"use client";

import {
  useCallback,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  TaxonomyApiError,
  taxonomyApi,
  type NodeDetail,
} from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/useUrlState";

type ActionState = {
  busy: boolean;
  error: string | null;
};

const IDLE: ActionState = { busy: false, error: null };

export function ModerationActions({ node }: { node: NodeDetail }) {
  const router = useRouter();
  const { update } = useUrlState();
  const [action, setAction] = useState<ActionState>(IDLE);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(node.canonicalName);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setAction({ busy: true, error: null });
      try {
        await fn();
        setAction(IDLE);
        router.refresh();
      } catch (e: unknown) {
        setAction({
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [router],
  );

  const handleVerify = useCallback(
    () => run(() => taxonomyApi.verify(node.id)),
    [node.id, run],
  );

  const handleHide = useCallback(
    () => run(() => taxonomyApi.hide(node.id)),
    [node.id, run],
  );

  const handleRenameToggle = useCallback(() => {
    setRenaming((on) => !on);
    setRenameDraft(node.canonicalName);
    setAction(IDLE);
  }, [node.canonicalName]);

  const handleRenameDraft = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setRenameDraft(e.target.value),
    [],
  );

  const handleRenameSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const newName = renameDraft.trim();
      if (!newName || newName === node.canonicalName) {
        setRenaming(false);
        return;
      }

      setAction({ busy: true, error: null });
      try {
        await taxonomyApi.rename(node.id, newName);
        setAction(IDLE);
        setRenaming(false);
        router.refresh();
      } catch (e: unknown) {
        if (e instanceof TaxonomyApiError && e.status === 409) {
          const targetId = extractMergeTargetId(e.body);
          if (targetId) {
            setAction({
              busy: false,
              error: `назва «${newName}» вже існує — пропонуємо об'єднати з нею`,
            });
            update({ selected: targetId });
            return;
          }
        }
        setAction({
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [renameDraft, node.canonicalName, node.id, router, update],
  );

  return (
    <div className="flex flex-col gap-2 border border-border bg-bg-elev p-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        дії модератора
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={action.busy || node.status === "VERIFIED"}
          onClick={handleVerify}
          className={cn(
            "border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
            node.status === "VERIFIED" || action.busy
              ? "border-border text-text-muted"
              : "border-success text-success hover:bg-success hover:text-bg",
          )}
        >
          підтвердити
        </button>
        <button
          type="button"
          disabled={action.busy || node.status === "HIDDEN"}
          onClick={handleHide}
          className={cn(
            "border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
            node.status === "HIDDEN" || action.busy
              ? "border-border text-text-muted"
              : "border-danger text-danger hover:bg-danger hover:text-bg",
          )}
        >
          приховати
        </button>
        <button
          type="button"
          disabled={action.busy}
          onClick={handleRenameToggle}
          className={cn(
            "border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
            action.busy
              ? "border-border text-text-muted"
              : renaming
                ? "border-accent text-accent"
                : "border-border text-text-secondary hover:border-accent hover:text-accent",
          )}
        >
          {renaming ? "скасувати" : "перейменувати"}
        </button>
      </div>

      {renaming ? (
        <form onSubmit={handleRenameSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={renameDraft}
            onChange={handleRenameDraft}
            aria-label="нова назва поняття"
            autoFocus
            className="flex-1 border border-border bg-bg-card px-2 py-1 font-mono text-sm text-text-primary outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={action.busy}
            className="border border-accent px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent hover:bg-accent hover:text-bg disabled:border-border disabled:text-text-muted"
          >
            зберегти
          </button>
        </form>
      ) : null}

      {action.error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-2 font-mono text-[11px] text-danger">
          {action.error}
        </pre>
      ) : null}
    </div>
  );
}

function extractMergeTargetId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  // Nest's HttpException wraps the response body, so the shape can be
  // either `{ suggestion: { mergeTargetId } }` (direct) or nested under
  // `message` when serialized by a downstream filter.
  const direct = (body as { suggestion?: { mergeTargetId?: unknown } })
    .suggestion?.mergeTargetId;
  if (typeof direct === "string") return direct;
  const inner = (body as { message?: unknown }).message;
  if (typeof inner === "object" && inner !== null) {
    const nested = (inner as { suggestion?: { mergeTargetId?: unknown } })
      .suggestion?.mergeTargetId;
    if (typeof nested === "string") return nested;
  }
  return null;
}
