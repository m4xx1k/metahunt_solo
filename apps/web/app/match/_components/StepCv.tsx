"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileArrowUpIcon, ListPlusIcon } from "@phosphor-icons/react/dist/ssr";

import { TelegramLoginButton } from "@/features/auth/telegram-login-button";
import { useSession } from "@/features/auth/use-session";
import type { CvIngestResult } from "@/lib/api/cv";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const ACCEPT = ".pdf,.txt,application/pdf,text/plain";

// Entry step: path A (drop a CV) or path B (pick skills by hand). Uploading
// needs a Telegram session (the API binds the candidate to the user), so the
// dropzone swaps its trigger for the login button until one exists. Path B
// never asks for anything.
export function StepCv({
  ingest,
  uploading,
  error,
  onFile,
  onManual,
  onNext,
}: {
  /** Already-parsed CV (back-navigation) — offer "continue" instead of re-upload. */
  ingest: CvIngestResult | null;
  uploading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onManual: () => void;
  onNext: () => void;
}) {
  const { isLoggedIn } = useSession();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (ingest) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-success">CV прочитано</p>
        <p className="text-sm leading-relaxed text-text-secondary">
          Розпізнали <span className="font-bold text-text-primary">{ingest.matched.length}</span>{" "}
          навичок
          {ingest.role ? (
            <>
              {" "}
              та роль <span className="font-bold text-text-primary">{ingest.role}</span>
            </>
          ) : null}
          . Далі перевіриш і поправиш список.
        </p>
        <Button size="md" onClick={onNext} className="w-full sm:w-auto">
          Продовжити →
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file && isLoggedIn && !uploading) onFile(file);
          }}
          className={cn(
            "flex flex-col items-center gap-3 border border-dashed p-6 text-center transition-colors sm:p-8",
            dragging ? "border-accent bg-accent/5" : "border-border-strong",
          )}
        >
          <FileArrowUpIcon className="h-7 w-7 text-accent" aria-hidden />
          <p className="font-display text-lg font-bold text-text-primary">З CV — точніше</p>
          <p className="text-sm leading-relaxed text-text-secondary">
            PDF або .txt. Витягнемо навички за секунди — і одразу порахуємо збіг із кожною
            вакансією.
          </p>
          {isLoggedIn ? (
            <Button
              size="md"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-1 w-full sm:w-auto"
            >
              {uploading ? "Читаємо CV…" : "Завантажити CV"}
            </Button>
          ) : (
            <div className="mt-1 flex flex-col items-center gap-2">
              <TelegramLoginButton />
              <p className="font-mono text-2xs text-text-muted">
                вхід через Telegram — щоб CV був тільки твій
              </p>
            </div>
          )}
          <Link
            href="/privacy#cv"
            className="font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
          >
            CV не зберігаємо — лише навички
          </Link>
        </div>

        <div className="flex flex-col items-center gap-3 border border-border p-6 text-center sm:p-8">
          <ListPlusIcon className="h-7 w-7 text-accent" aria-hidden />
          <p className="font-display text-lg font-bold text-text-primary">Без CV — швидше</p>
          <p className="text-sm leading-relaxed text-text-secondary">
            Обери навички зі списку вручну. Без файлів, без реєстрації — одразу до вакансій.
          </p>
          <Button
            variant="secondary"
            size="md"
            onClick={onManual}
            className="mt-1 w-full sm:w-auto"
          >
            Продовжити без CV →
          </Button>
        </div>
      </div>

      {uploading ? (
        <p className="font-mono text-xs text-text-secondary" role="status">
          <span className="text-accent">▮▮▮</span> Читаємо CV… нікуди його не зберігаємо, лише
          навички.
        </p>
      ) : null}
      {error ? (
        <p className="border border-danger/40 bg-danger/5 px-4 py-2 font-mono text-xs text-danger">
          {error} — спробуй інший файл або продовж без CV.
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
