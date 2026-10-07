"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  CheckIcon,
  FileArrowUpIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { cvApi } from "@/lib/api/cv";
import { subscriptionsApi, type SubscriptionFilter } from "@/lib/api/subscriptions";
import { vacanciesApi } from "@/lib/api/vacancies";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { cn } from "@/lib/utils";
import { Button, Tag } from "@/ui";

// Core disciplines with their URL-facing slugs
const CORE_ROLES = [
  { id: "backend", label: "Backend", keywords: ["backend", "go", "python", "node", "java"] },
  { id: "frontend", label: "Frontend", keywords: ["frontend", "react", "vue"] },
  { id: "fullstack", label: "Fullstack", keywords: ["fullstack", "full-stack"] },
  { id: "devops", label: "DevOps", keywords: ["devops", "cloud", "infra"] },
  { id: "qa", label: "QA", keywords: ["qa", "test", "automation"] },
  { id: "mobile", label: "Mobile", keywords: ["mobile", "ios", "android", "flutter"] },
  { id: "data-ai", label: "Data & AI", keywords: ["data", "ml", "ai", "analytics"] },
] as const;

// 6-8 high-signal skills per role for 1-tap toggling
const ROLE_SKILL_PRESETS: Record<string, { id: string; label: string }[]> = {
  backend: [
    { id: "go", label: "Go" },
    { id: "postgresql", label: "PostgreSQL" },
    { id: "docker", label: "Docker" },
    { id: "kubernetes", label: "Kubernetes" },
    { id: "python", label: "Python" },
    { id: "node-js", label: "Node.js" },
    { id: "aws", label: "AWS" },
    { id: "redis", label: "Redis" },
  ],
  frontend: [
    { id: "typescript", label: "TypeScript" },
    { id: "react", label: "React" },
    { id: "next-js", label: "Next.js" },
    { id: "vue-js", label: "Vue" },
    { id: "tailwind-css", label: "Tailwind" },
    { id: "graphql", label: "GraphQL" },
  ],
  fullstack: [
    { id: "typescript", label: "TypeScript" },
    { id: "react", label: "React" },
    { id: "node-js", label: "Node.js" },
    { id: "postgresql", label: "PostgreSQL" },
    { id: "docker", label: "Docker" },
    { id: "aws", label: "AWS" },
  ],
  devops: [
    { id: "kubernetes", label: "Kubernetes" },
    { id: "docker", label: "Docker" },
    { id: "terraform", label: "Terraform" },
    { id: "aws", label: "AWS" },
    { id: "ci-cd", label: "CI/CD" },
    { id: "linux", label: "Linux" },
  ],
  qa: [
    { id: "playwright", label: "Playwright" },
    { id: "cypress", label: "Cypress" },
    { id: "automation", label: "Automation" },
    { id: "postman", label: "Postman" },
    { id: "python", label: "Python" },
    { id: "sql", label: "SQL" },
  ],
  mobile: [
    { id: "flutter", label: "Flutter" },
    { id: "react-native", label: "React Native" },
    { id: "swift", label: "Swift" },
    { id: "kotlin", label: "Kotlin" },
    { id: "ios", label: "iOS" },
    { id: "android", label: "Android" },
  ],
  "data-ai": [
    { id: "python", label: "Python" },
    { id: "sql", label: "SQL" },
    { id: "apache-spark", label: "Spark" },
    { id: "airflow", label: "Airflow" },
    { id: "postgresql", label: "PostgreSQL" },
    { id: "kafka", label: "Kafka" },
  ],
};

export function HomeRadarBlock({ className }: { className?: string }) {
  const router = useRouter();
  const analytics = useAnalytics();
  const { isLoggedIn } = useSession();

  const [mode, setMode] = useState<"stack" | "cv">("stack");
  const [selectedRole, setSelectedRole] = useState<string>("backend");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["go", "postgresql", "docker"]);
  const [isRemoteOnly, setIsRemoteOnly] = useState(true);

  // CV Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [cvSuccessLabel, setCvSuccessLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit in flight
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available skills for currently selected role
  const availableSkills = useMemo(() => {
    return ROLE_SKILL_PRESETS[selectedRole] ?? ROLE_SKILL_PRESETS.backend;
  }, [selectedRole]);

  // Skill toggle
  const toggleSkill = useCallback((skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId],
    );
  }, []);

  // Filter payload for subscription
  const currentFilter = useMemo<SubscriptionFilter>(() => {
    return {
      roleIds: selectedRole ? [selectedRole] : undefined,
      skillIds: selectedSkills.length > 0 ? selectedSkills : undefined,
      workFormats: isRemoteOnly ? ["REMOTE"] : undefined,
    };
  }, [selectedRole, selectedSkills, isRemoteOnly]);

  // Live matching count
  const { data: countData, isFetching: isCounting } = useQuery({
    queryKey: ["home-radar-count", currentFilter],
    queryFn: () => vacanciesApi.list({ ...currentFilter, pageSize: 1 }),
    staleTime: 30_000,
  });

  const liveCount = countData?.total ?? null;

  // Telegram CTA
  const handleTelegramSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await subscriptionsApi.create(currentFilter);
      if (tab) {
        tab.opener = null;
        tab.location.href = result.deepLink;
      } else {
        window.location.href = result.deepLink;
      }
      toast.success("Відкриваємо Telegram для старту бота!");
    } catch {
      analytics.subscriptionCreateFailed("feed");
      tab?.close();
      toast.error("Не вдалося створити радар. Спробуй ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }, [analytics, currentFilter, isSubmitting]);

  // Scroll to feed with filters
  const handleScrollToFeed = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedRole) params.set("roles", selectedRole);
    if (selectedSkills.length > 0) params.set("skills", selectedSkills.join(","));
    if (isRemoteOnly) params.set("workFormats", "REMOTE");

    router.push(`/?${params.toString()}`, { scroll: false });

    // Smooth scroll to feed
    const feedElement = document.getElementById("feed-shell") || document.querySelector("main");
    feedElement?.scrollIntoView({ behavior: "smooth" });
  }, [selectedRole, selectedSkills, isRemoteOnly, router]);

  // Handle CV file
  const handleCvFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        analytics.cvUpload(info.reused);

        if (info.matched && info.matched.length > 0) {
          setSelectedSkills(info.matched.map((m) => m.id));
        }

        if (info.role) {
          const lower = info.role.toLowerCase();
          const matched = CORE_ROLES.find((r) => r.keywords.some((kw) => lower.includes(kw)));
          if (matched) setSelectedRole(matched.id);
        }

        setCvSuccessLabel(`Розпізнано ${info.matched.length} скілів`);
        setMode("stack");
        toast.success("CV розпізнано! Стек заповнено автоматично.");
      } catch (e) {
        analytics.cvUploadFailed();
        toast.error(e instanceof Error ? e.message : "Не вдалося розпізнати CV");
      } finally {
        setIsUploading(false);
      }
    },
    [analytics],
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border bg-bg-card p-6 shadow-brut md:p-8",
        className,
      )}
    >
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <Tag>&gt; НАЛАШТУЙ СВІЙ РАДАР</Tag>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            Тільки те, що підходить під твій стек.
          </h2>
          <p className="max-w-[580px] font-body text-sm text-text-secondary">
            Без повторів з DOU і Djinni. Обери свій стек або скинь CV — система покаже збіг і
            надішле нові в Telegram.
          </p>
        </div>

        {/* Minimal Mode Pill */}
        <div className="flex shrink-0 items-center border border-border bg-bg p-1">
          <button
            type="button"
            onClick={() => setMode("stack")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 font-mono text-xs font-bold transition-colors",
              mode === "stack"
                ? "bg-accent text-bg shadow-brut-2xs"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <SparkleIcon weight={mode === "stack" ? "fill" : "regular"} className="h-3.5 w-3.5" />
            <span>Вказати стек</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("cv")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 font-mono text-xs font-bold transition-colors",
              mode === "cv"
                ? "bg-accent text-bg shadow-brut-2xs"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <FileArrowUpIcon weight={mode === "cv" ? "fill" : "regular"} className="h-3.5 w-3.5" />
            <span>Скинути CV</span>
            {cvSuccessLabel ? <span className="size-1.5 rounded-full bg-success" /> : null}
          </button>
        </div>
      </div>

      {/* Main Interactive Area */}
      {mode === "cv" ? (
        <div className="mt-6 flex flex-col items-center justify-center border border-dashed border-border-strong bg-bg/60 p-8 text-center transition-colors hover:border-text-secondary sm:py-10">
          <FileArrowUpIcon className="h-8 w-8 text-accent" />
          <p className="mt-2 font-display text-base font-bold text-text-primary">
            Завантаж резюме для автозаповнення
          </p>
          <p className="mt-1 max-w-[440px] text-xs text-text-secondary">
            PDF або .txt. Ми витягнемо навички й роль за 2 секунди, щоб не вводити вручну.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCvFile(file);
            }}
          />

          {isLoggedIn ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4"
            >
              {isUploading ? "Аналізуємо CV…" : "Обрати файл CV"}
            </Button>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2">
              <AuthChoice label="Увійти для збереження CV" size="sm" />
              <p className="font-mono text-2xs text-text-muted">
                Авторизуйся, щоб резюме закріпилося за твоїм профілем
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {/* 1. Роль */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
              1. Цільова роль:
            </span>
            <div className="flex flex-wrap gap-2">
              {CORE_ROLES.map((role) => {
                const active = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(role.id);
                      // Pre-select top 3 skills of this role
                      const top = ROLE_SKILL_PRESETS[role.id]?.slice(0, 3).map((s) => s.id) ?? [];
                      setSelectedSkills(top);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 border px-3 py-1.5 font-display text-xs font-bold transition-all",
                      active
                        ? "border-accent bg-accent text-bg shadow-brut-xs"
                        : "border-border bg-bg text-text-secondary hover:border-text-secondary hover:text-text-primary",
                    )}
                  >
                    {active ? <CheckIcon weight="bold" className="h-3 w-3" /> : null}
                    <span>{role.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Стек */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                2. Твій стек (клікни щоб увімкнути/вимкнути):
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-2xs text-text-muted hover:text-text-primary select-none">
                <input
                  type="checkbox"
                  checked={isRemoteOnly}
                  onChange={(e) => setIsRemoteOnly(e.target.checked)}
                  className="accent-accent h-3.5 w-3.5"
                />
                <span>Тільки Remote</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableSkills.map((skill) => {
                const active = selectedSkills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    className={cn(
                      "border px-2.5 py-1 font-mono text-xs transition-colors",
                      active
                        ? "border-accent bg-accent/15 text-accent font-bold shadow-brut-2xs"
                        : "border-border bg-bg text-text-muted hover:border-text-secondary hover:text-text-primary",
                    )}
                  >
                    {active ? "✓ " : "+ "}
                    {skill.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Conversion Strip */}
      <div className="mt-7 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Live Matching Count */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-accent animate-pulse">🔥</span>
          <span className="text-text-primary">
            {isCounting ? (
              <span className="text-text-muted">Рахуємо активні вакансії…</span>
            ) : liveCount !== null ? (
              <>
                <strong className="text-accent font-bold">{liveCount}</strong> вакансій під цей стек
                за 30 днів
              </>
            ) : (
              "Оновлюємо дані..."
            )}
          </span>
        </div>

        {/* CTA Actions */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleScrollToFeed}
            className="gap-1 font-mono text-xs"
          >
            <span>Показати у стрічці</span>
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isSubmitting || selectedSkills.length === 0}
            onClick={handleTelegramSubscribe}
            className="gap-2 text-xs"
          >
            <PaperPlaneTiltIcon weight="fill" className="h-4 w-4" />
            <span>{isSubmitting ? "Підключаємо…" : "Отримувати в Telegram →"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
