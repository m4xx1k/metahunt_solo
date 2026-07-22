"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { meApi } from "@/lib/api/me";
import { Button } from "@/ui";

const CONFIRMATION = "DELETE";

export function DeleteAccountPanel({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const remove = useMutation({
    mutationFn: meApi.deleteAccount,
    onSuccess: async () => {
      await onDeleted();
      toast.success("Account and personal data deleted");
    },
    onError: () => toast.error("Couldn't delete account"),
  });

  const handleOpen = useCallback(() => setConfirming(true), []);
  const handleCancel = useCallback(() => {
    setConfirming(false);
    setConfirmation("");
  }, []);
  const handleConfirmation = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setConfirmation(event.target.value);
  }, []);
  const handleDelete = useCallback(() => {
    if (confirmation === CONFIRMATION) remove.mutate();
  }, [confirmation, remove]);

  return (
    <section className="border-t border-danger/50 pt-8" aria-labelledby="delete-account-title">
      <h2
        id="delete-account-title"
        className="mb-3 font-mono text-2xs uppercase tracking-wider text-danger"
      >
        delete account
      </h2>
      <div className="border border-danger/60 bg-bg-card p-5 shadow-brut-sm">
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Permanently remove your Telegram identity, CV-derived profile and skills, subscriptions,
          and notification history. This cannot be undone.
        </p>

        {confirming ? (
          <div className="mt-5 flex max-w-md flex-col gap-3">
            <label htmlFor="account-delete-confirmation" className="font-mono text-xs text-danger">
              Type {CONFIRMATION} to confirm
            </label>
            <input
              id="account-delete-confirmation"
              type="text"
              value={confirmation}
              onChange={handleConfirmation}
              autoComplete="off"
              disabled={remove.isPending}
              className="border border-danger bg-bg px-3 py-2 font-mono text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-danger disabled:opacity-50"
            />
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDelete}
                disabled={confirmation !== CONFIRMATION || remove.isPending}
                className="border-danger text-danger hover:bg-danger hover:text-bg"
              >
                {remove.isPending ? "deleting…" : "delete permanently"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancel}
                disabled={remove.isPending}
              >
                cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpen}
            className="mt-5 border-danger text-danger hover:bg-danger hover:text-bg"
          >
            delete my account
          </Button>
        )}
      </div>
    </section>
  );
}
