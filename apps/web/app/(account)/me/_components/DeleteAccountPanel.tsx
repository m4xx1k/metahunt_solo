"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { meApi } from "@/lib/api/me";
import { Button } from "@/ui";
import { Panel } from "@/ui/layout/Panel";

const CONFIRMATION = "DELETE";

export function DeleteAccountPanel({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const remove = useMutation({
    mutationFn: meApi.deleteAccount,
    onSuccess: async () => {
      await onDeleted();
      toast.success("Акаунт видалено");
    },
    onError: () => toast.error("Не вдалося видалити акаунт"),
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
    <Panel title="видалити акаунт" tone="danger" className="border-danger/60 shadow-brut-sm">
      <p className="max-w-2xl font-mono text-2xs leading-relaxed text-text-secondary">
        Видалимо акаунт, CV, підписки та історію сповіщень. Це незворотно.
      </p>

      {confirming ? (
        <div className="flex max-w-md flex-col gap-3">
          <label htmlFor="account-delete-confirmation" className="font-mono text-xs text-danger">
            Введи {CONFIRMATION}
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
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDelete}
              disabled={confirmation !== CONFIRMATION || remove.isPending}
              className="border-danger text-danger hover:bg-danger hover:text-bg"
            >
              {remove.isPending ? "видаляю…" : "видалити назавжди"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              disabled={remove.isPending}
            >
              скасувати
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpen}
          className="border-danger text-danger hover:bg-danger hover:text-bg"
        >
          видалити акаунт
        </Button>
      )}
    </Panel>
  );
}
