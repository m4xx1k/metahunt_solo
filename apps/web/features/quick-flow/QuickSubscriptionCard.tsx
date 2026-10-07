"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CheckIcon,
  FileArrowUpIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { cvApi, type CvIngestResult } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import { subscriptionsApi, type SubscriptionFilter } from "@/lib/api/subscriptions";
import {
  vacanciesApi,
  type Seniority,
  type EnglishLevel,
  type WorkFormat,
} from "@/lib/api/vacancies";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export interface QuickSkillItem {
  id: string;
  name: string;
}

// Curated role presets for immediate one-tap selection
const POPULAR_ROLES = [
  {
    id: "backend-engineer",
    name: "Backend",
    keywords: ["backend", "go", "python", "node", "java"],
  },
  { id: "frontend-engineer", name: "Frontend", keywords: ["frontend", "react", "vue", "angular"] },
  { id: "full-stack-engineer", name: "Fullstack", keywords: ["full-stack", "fullstack"] },
  { id: "devops-engineer", name: "DevOps", keywords: ["devops", "cloud", "infrastructure"] },
  { id: "qa-engineer", name: "QA Automation", keywords: ["qa", "test", "automation"] },
  { id: "mobile-developer", name: "Mobile", keywords: ["mobile", "ios", "android", "flutter"] },
  { id: "data-engineer", name: "Data / AI", keywords: ["data", "ml", "python", "analytics"] },
] as const;

// Role-tailored top skills for quick toggling
const ROLE_SKILL_RECOMMENDATIONS: Record<string, QuickSkillItem[]> = {
  "backend-engineer": [
    { id: "go", name: "Go" },
    { id: "postgresql", name: "PostgreSQL" },
    { id: "docker", name: "Docker" },
    { id: "kubernetes", name: "Kubernetes" },
    { id: "python", name: "Python" },
    { id: "node-js", name: "Node.js" },
    { id: "redis", name: "Redis" },
    { id: "aws", name: "AWS" },
    { id: "grpc", name: "gRPC" },
  ],
  "frontend-engineer": [
    { id: "typescript", name: "TypeScript" },
    { id: "react", name: "React" },
    { id: "next-js", name: "Next.js" },
    { id: "vue-js", name: "Vue.js" },
    { id: "tailwind-css", name: "Tailwind CSS" },
    { id: "graphql", name: "GraphQL" },
    { id: "redux", name: "Redux" },
  ],
  "full-stack-engineer": [
    { id: "typescript", name: "TypeScript" },
    { id: "react", name: "React" },
    { id: "node-js", name: "Node.js" },
    { id: "postgresql", name: "PostgreSQL" },
    { id: "docker", name: "Docker" },
    { id: "next-js", name: "Next.js" },
    { id: "aws", name: "AWS" },
  ],
  "devops-engineer": [
    { id: "kubernetes", name: "Kubernetes" },
    { id: "docker", name: "Docker" },
    { id: "terraform", name: "Terraform" },
    { id: "aws", name: "AWS" },
    { id: "ci-cd", name: "CI/CD" },
    { id: "linux", name: "Linux" },
    { id: "ansible", name: "Ansible" },
  ],
  "qa-engineer": [
    { id: "playwright", name: "Playwright" },
    { id: "cypress", name: "Cypress" },
    { id: "automation", name: "Automation" },
    { id: "postman", name: "Postman" },
    { id: "python", name: "Python" },
    { id: "sql", name: "SQL" },
  ],
  "mobile-developer": [
    { id: "flutter", name: "Flutter" },
    { id: "react-native", name: "React Native" },
    { id: "swift", name: "Swift" },
    { id: "kotlin", name: "Kotlin" },
    { id: "ios", name: "iOS" },
    { id: "android", name: "Android" },
  ],
  "data-engineer": [
    { id: "python", name: "Python" },
    { id: "sql", name: "SQL" },
    { id: "apache-spark", name: "Spark" },
    { id: "airflow", name: "Airflow" },
    { id: "postgresql", name: "PostgreSQL" },
    { id: "kafka", name: "Kafka" },
  ],
};

const DEFAULT_RECOMMENDED_SKILLS: QuickSkillItem[] = [
  { id: "go", name: "Go" },
  { id: "typescript", name: "TypeScript" },
  { id: "react", name: "React" },
  { id: "python", name: "Python" },
  { id: "postgresql", name: "PostgreSQL" },
  { id: "docker", name: "Docker" },
  { id: "kubernetes", name: "Kubernetes" },
  { id: "aws", name: "AWS" },
];

const SENIORITY_OPTIONS: { id: Seniority; label: string }[] = [
  { id: "JUNIOR", label: "Junior" },
  { id: "MIDDLE", label: "Middle" },
  { id: "SENIOR", label: "Senior" },
  { id: "LEAD", label: "Lead" },
];

const ENGLISH_OPTIONS: { id: EnglishLevel; label: string }[] = [
  { id: "INTERMEDIATE", label: "B1 Intermediate" },
  { id: "UPPER_INTERMEDIATE", label: "B2 Upper-Int" },
  { id: "ADVANCED", label: "C1 Advanced" },
];

const COMMON_EXCLUDE_SKILLS: QuickSkillItem[] = [
  { id: "php", name: "PHP" },
  { id: "ruby", name: "Ruby" },
  { id: "1c", name: "1C" },
  { id: "wordpress", name: "WordPress" },
];

export interface QuickSubscriptionCardProps {
  className?: string;
  onSuccess?: () => void;
}

export function QuickSubscriptionCard({ className, onSuccess }: QuickSubscriptionCardProps) {
  const router = useRouter();
  const analytics = useAnalytics();
  const { isLoggedIn } = useSession();

  // Mode: "manual" or "cv"
  const [activeTab, setActiveTab] = useState<"manual" | "cv">("manual");

  // Selection states
  const [selectedRole, setSelectedRole] = useState<string>("backend-engineer");
  const [selectedSkills, setSelectedSkills] = useState<QuickSkillItem[]>([
    { id: "go", name: "Go" },
    { id: "postgresql", name: "PostgreSQL" },
    { id: "docker", name: "Docker" },
  ]);
  const [selectedSeniorities, setSelectedSeniorities] = useState<Seniority[]>(["MIDDLE", "SENIOR"]);
  const [selectedEnglish, setSelectedEnglish] = useState<EnglishLevel | null>("UPPER_INTERMEDIATE");
  const [onlyRemote, setOnlyRemote] = useState<boolean>(true);
  const [excludedSkills, setExcludedSkills] = useState<QuickSkillItem[]>([]);

  // Search input for adding custom skills
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);

  // Accordion for extra filters
  const [isExtraOpen, setIsExtraOpen] = useState(false);

  // CV Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedCvInfo, setUploadedCvInfo] = useState<CvIngestResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch full skill catalog for auto-suggest
  const { data: skillsCatalog } = useQuery({
    queryKey: ["facets-skills"],
    queryFn: () => facetsApi.skills(),
    staleTime: 5 * 60_000,
  });

  // Filter catalog skills by search input
  const skillSearchResults = useMemo(() => {
    if (!skillSearchQuery.trim() || !skillsCatalog?.skills) return [];
    const query = skillSearchQuery.toLowerCase().trim();
    const existingIds = new Set(selectedSkills.map((s) => s.id));
    return skillsCatalog.skills
      .filter((s) => !existingIds.has(s.id) && s.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [skillSearchQuery, skillsCatalog, selectedSkills]);

  // Available quick-chips for the currently active role
  const recommendedSkillsForRole = useMemo(() => {
    const list = ROLE_SKILL_RECOMMENDATIONS[selectedRole] ?? DEFAULT_RECOMMENDED_SKILLS;
    const selectedIds = new Set(selectedSkills.map((s) => s.id));
    return list.filter((s) => !selectedIds.has(s.id));
  }, [selectedRole, selectedSkills]);

  // Compose active SubscriptionFilter
  const activeFilter = useMemo<SubscriptionFilter>(() => {
    return {
      roleIds: selectedRole ? [selectedRole] : undefined,
      skillIds: selectedSkills.length > 0 ? selectedSkills.map((s) => s.id) : undefined,
      seniorities: selectedSeniorities.length > 0 ? selectedSeniorities : undefined,
      englishLevels: selectedEnglish ? [selectedEnglish] : undefined,
      workFormats: onlyRemote ? (["REMOTE"] as WorkFormat[]) : undefined,
      excludedSkillIds: excludedSkills.length > 0 ? excludedSkills.map((s) => s.id) : undefined,
    };
  }, [
    selectedRole,
    selectedSkills,
    selectedSeniorities,
    selectedEnglish,
    onlyRemote,
    excludedSkills,
  ]);

  // Query live count of matching vacancies
  const { data: liveCountData, isFetching: isCounting } = useQuery({
    queryKey: ["quick-count", activeFilter],
    queryFn: () => vacanciesApi.list({ ...activeFilter, pageSize: 1 }),
    staleTime: 30_000,
  });

  const matchingCount = liveCountData?.total ?? null;

  // Skill management callbacks
  const handleAddSkill = useCallback((skill: QuickSkillItem) => {
    setSelectedSkills((prev) => {
      if (prev.some((s) => s.id === skill.id)) return prev;
      return [...prev, skill];
    });
    setSkillSearchQuery("");
    setShowSkillDropdown(false);
  }, []);

  const handleRemoveSkill = useCallback((id: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleToggleSeniority = useCallback((sen: Seniority) => {
    setSelectedSeniorities((prev) =>
      prev.includes(sen) ? prev.filter((s) => s !== sen) : [...prev, sen],
    );
  }, []);

  const handleToggleExcludeSkill = useCallback((skill: QuickSkillItem) => {
    setExcludedSkills((prev) =>
      prev.some((s) => s.id === skill.id)
        ? prev.filter((s) => s.id !== skill.id)
        : [...prev, skill],
    );
  }, []);

  // Handle CV Upload
  const handleProcessFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setIsUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        analytics.cvUpload(info.reused);
        setUploadedCvInfo(info);

        // Autofill skills from CV
        if (info.matched && info.matched.length > 0) {
          setSelectedSkills(info.matched.map((m) => ({ id: m.id, name: m.name })));
        }

        // Try to match role from CV
        if (info.role) {
          const lower = info.role.toLowerCase();
          const matchedRole = POPULAR_ROLES.find((r) =>
            r.keywords.some((kw) => lower.includes(kw)),
          );
          if (matchedRole) {
            setSelectedRole(matchedRole.id);
          }
        }

        // Match seniority if detected
        if (info.seniority) {
          const sUpper = info.seniority.toUpperCase() as Seniority;
          if (["JUNIOR", "MIDDLE", "SENIOR", "LEAD"].includes(sUpper)) {
            setSelectedSeniorities([sUpper]);
          }
        }

        toast.success(`CV розпізнано! Знайдено ${info.matched.length} навичок.`);
        // Switch to manual review so user can see and edit the populated result
        setActiveTab("manual");
      } catch (e) {
        analytics.cvUploadFailed();
        setUploadError(e instanceof Error ? e.message : "Не вдалося обробити файл CV");
        toast.error("Помилка обробки файлу. Спробуй ще раз або вкажи стек вручну.");
      } finally {
        setIsUploading(false);
      }
    },
    [analytics],
  );

  // Subscribe in Telegram CTA
  const handleTelegramSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await subscriptionsApi.create(activeFilter);
      if (tab) {
        tab.opener = null;
        tab.location.href = result.deepLink;
      } else {
        window.location.href = result.deepLink;
      }
      toast.success("Відкриваємо Telegram для активації радара!");
      onSuccess?.();
    } catch {
      analytics.subscriptionCreateFailed("feed");
      tab?.close();
      toast.error("Не вдалося створити радар. Спробуй ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeFilter, analytics, isSubmitting, onSuccess]);

  // Browse matching vacancies
  const handleViewVacancies = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedRole) params.set("roles", selectedRole);
    if (selectedSkills.length > 0) {
      params.set("skills", selectedSkills.map((s) => s.id).join(","));
    }
    if (selectedSeniorities.length > 0) {
      params.set("seniorities", selectedSeniorities.join(","));
    }
    if (onlyRemote) params.set("workFormats", "REMOTE");
    if (selectedEnglish) params.set("englishLevels", selectedEnglish);
    if (excludedSkills.length > 0) {
      params.set("excludedSkillIds", excludedSkills.map((s) => s.id).join(","));
    }
    router.push(`/?${params.toString()}`);
  }, [
    selectedRole,
    selectedSkills,
    selectedSeniorities,
    onlyRemote,
    selectedEnglish,
    excludedSkills,
    router,
  ]);

  return (
    <div
      className={cn(
        "flex w-full flex-col border border-border bg-bg-card shadow-brut-lg transition-all",
        className,
      )}
    >
      {/* Tab Switcher Header */}
      <div className="flex border-b border-border bg-bg">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 border-r border-border py-3.5 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors sm:text-sm",
            activeTab === "manual"
              ? "bg-bg-card text-accent border-b-2 border-b-accent"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <SparkleIcon weight={activeTab === "manual" ? "fill" : "regular"} className="h-4 w-4" />
          <span>Вказати стек вручну</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cv")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 py-3.5 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors sm:text-sm",
            activeTab === "cv"
              ? "bg-bg-card text-accent border-b-2 border-b-accent"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <FileArrowUpIcon weight={activeTab === "cv" ? "fill" : "regular"} className="h-4 w-4" />
          <span>Завантажити CV (PDF)</span>
          {uploadedCvInfo ? (
            <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-success" />
          ) : null}
        </button>
      </div>

      <div className="p-5 sm:p-7 md:p-8">
        {/* CV UPLOAD VIEW */}
        {activeTab === "cv" ? (
          <div className="flex flex-col gap-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file && !isUploading) handleProcessFile(file);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-3.5 border-2 border-dashed p-8 text-center transition-colors sm:py-12",
                isDragging
                  ? "border-accent bg-accent/10"
                  : "border-border-strong bg-bg/50 hover:border-text-secondary",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-none border border-border bg-bg-card shadow-brut-xs">
                <FileArrowUpIcon className="h-6 w-6 text-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-display text-base font-bold text-text-primary sm:text-lg">
                  Перетягни резюме або обери файл
                </p>
                <p className="text-xs text-text-secondary sm:text-sm">
                  PDF або .txt · Автоматично визначимо роль, стек, роки досвіду та рівень
                  англійської
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />

              {isLoggedIn ? (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  {isUploading ? "Читаємо навички з CV…" : "Обрати файл CV"}
                </Button>
              ) : (
                <div className="mt-2 flex flex-col items-center gap-2">
                  <AuthChoice label="Увійти для аналізу CV" size="md" />
                  <p className="font-mono text-2xs text-text-muted">
                    Безпечно: сирий файл не зберігається, лише витягнутий стек
                  </p>
                </div>
              )}

              {uploadError ? <p className="font-mono text-xs text-danger">{uploadError}</p> : null}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted font-mono">
              <span>Не маєш CV під рукою?</span>
              <button
                type="button"
                onClick={() => setActiveTab("manual")}
                className="text-accent underline hover:text-accent/80"
              >
                Налаштувати стек за 3 кліки вручну →
              </button>
            </div>
          </div>
        ) : (
          /* MANUAL STACK CONFIG VIEW */
          <div className="flex flex-col gap-6">
            {uploadedCvInfo ? (
              <div className="flex items-center justify-between border border-success/40 bg-success/10 px-4 py-2.5 text-xs text-text-primary">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon weight="fill" className="h-4 w-4 text-success shrink-0" />
                  <span>
                    Поля заповнено на основі вашого CV (
                    <strong className="text-success">{uploadedCvInfo.matched.length}</strong>{" "}
                    навичок виявлено)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadedCvInfo(null)}
                  className="text-text-muted hover:text-text-primary"
                  title="Очистити"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {/* 1. РОЛЬ */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="font-display text-xs font-bold uppercase tracking-wider text-text-secondary">
                  1. Обери свою роль:
                </label>
                <span className="font-mono text-2xs text-text-muted">
                  {selectedRole ? "Фокусуємо видачу" : "Обери основний профіль"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_ROLES.map((role) => {
                  const isActive = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role.id)}
                      className={cn(
                        "flex items-center gap-1.5 border px-3 py-1.5 font-display text-xs font-bold transition-all",
                        isActive
                          ? "border-accent bg-accent text-bg shadow-brut-xs"
                          : "border-border bg-bg text-text-primary hover:border-text-secondary",
                      )}
                    >
                      {isActive ? <CheckIcon weight="bold" className="h-3.5 w-3.5" /> : null}
                      <span>{role.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. НАВИЧКИ ТА СТЕК */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="font-display text-xs font-bold uppercase tracking-wider text-text-secondary">
                  2. Твій ключовий стек:
                </label>
                <span className="font-mono text-2xs text-text-muted">
                  {selectedSkills.length} обрано
                </span>
              </div>

              {/* Обрані скіли (chips) */}
              <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] border border-border bg-bg/80 p-2">
                {selectedSkills.length === 0 ? (
                  <span className="font-mono text-xs text-text-muted">
                    Обери технології нижче або додай через пошук
                  </span>
                ) : (
                  selectedSkills.map((skill) => (
                    <span
                      key={skill.id}
                      className="inline-flex items-center gap-1 border border-border-strong bg-bg-card px-2 py-0.5 font-mono text-xs text-text-primary"
                    >
                      <span>{skill.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill.id)}
                        className="text-text-muted transition-colors hover:text-danger"
                        aria-label={`Видалити ${skill.name}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Швидкі рекомендації навичок під роль */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-2xs text-text-muted font-mono">
                  <SparkleIcon className="h-3 w-3 text-accent" />
                  <span>Швидкий вибір для обраної ролі:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recommendedSkillsForRole.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => handleAddSkill(skill)}
                      className="inline-flex items-center gap-1 border border-dashed border-border bg-bg px-2 py-1 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      <PlusIcon className="h-3 w-3" />
                      <span>{skill.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Інпут пошуку додаткових навичок */}
              <div className="relative mt-1">
                <div className="relative flex items-center">
                  <MagnifyingGlassIcon className="absolute left-3 h-4 w-4 text-text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={skillSearchQuery}
                    onChange={(e) => {
                      setSkillSearchQuery(e.target.value);
                      setShowSkillDropdown(true);
                    }}
                    onFocus={() => setShowSkillDropdown(true)}
                    placeholder="Додати будь-яку іншу навичку (наприклад: Redis, RabbitMQ, Kafka)..."
                    className="w-full border border-border bg-bg py-2 pl-9 pr-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  {skillSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSkillSearchQuery("")}
                      className="absolute right-3 text-text-muted hover:text-text-primary"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown результатів пошуку */}
                {showSkillDropdown && skillSearchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto border border-border bg-bg-card p-1 shadow-brut-md">
                    {skillSearchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddSkill({ id: item.id, name: item.name })}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs text-text-primary hover:bg-bg-elev hover:text-accent"
                      >
                        <span>{item.name}</span>
                        <span className="text-2xs text-text-muted">{item.count} вакансій</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. ДОДАТКОВІ ФІЛЬТРИ (Accordion) */}
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setIsExtraOpen(!isExtraOpen)}
                className="flex w-full items-center justify-between py-1 text-left font-mono text-xs font-semibold text-text-muted hover:text-text-primary"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontalIcon className="h-3.5 w-3.5 text-accent" />
                  <span>Додаткові параметри (грейд, англійська, тільки ремоут, винятки)</span>
                </span>
                {isExtraOpen ? (
                  <CaretUpIcon className="h-3.5 w-3.5" />
                ) : (
                  <CaretDownIcon className="h-3.5 w-3.5" />
                )}
              </button>

              {isExtraOpen && (
                <div className="mt-4 flex flex-col gap-4 bg-bg/40 p-4 border border-border">
                  {/* Грейд */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-2xs font-bold uppercase tracking-wider text-text-muted">
                      Грейд:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SENIORITY_OPTIONS.map((sen) => {
                        const active = selectedSeniorities.includes(sen.id);
                        return (
                          <button
                            key={sen.id}
                            type="button"
                            onClick={() => handleToggleSeniority(sen.id)}
                            className={cn(
                              "border px-2.5 py-1 font-mono text-xs transition-colors",
                              active
                                ? "border-accent bg-accent/10 text-accent font-bold"
                                : "border-border text-text-secondary hover:border-text-muted",
                            )}
                          >
                            {sen.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Англійська */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-2xs font-bold uppercase tracking-wider text-text-muted">
                      Рівень англійської:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedEnglish(null)}
                        className={cn(
                          "border px-2.5 py-1 font-mono text-xs transition-colors",
                          selectedEnglish === null
                            ? "border-accent bg-accent/10 text-accent font-bold"
                            : "border-border text-text-secondary hover:border-text-muted",
                        )}
                      >
                        Будь-який
                      </button>
                      {ENGLISH_OPTIONS.map((eng) => {
                        const active = selectedEnglish === eng.id;
                        return (
                          <button
                            key={eng.id}
                            type="button"
                            onClick={() => setSelectedEnglish(active ? null : eng.id)}
                            className={cn(
                              "border px-2.5 py-1 font-mono text-xs transition-colors",
                              active
                                ? "border-accent bg-accent/10 text-accent font-bold"
                                : "border-border text-text-secondary hover:border-text-muted",
                            )}
                          >
                            {eng.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Формат роботи */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="remote-only-check"
                      checked={onlyRemote}
                      onChange={(e) => setOnlyRemote(e.target.checked)}
                      className="accent-accent h-4 w-4 rounded-none border-border"
                    />
                    <label
                      htmlFor="remote-only-check"
                      className="cursor-pointer font-mono text-xs text-text-secondary select-none"
                    >
                      Тільки віддалена робота (Remote)
                    </label>
                  </div>

                  {/* Винятки (Minus-skills) */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
                    <span className="font-display text-2xs font-bold uppercase tracking-wider text-text-muted">
                      Винятки (чого НЕ має бути у вакансіях):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_EXCLUDE_SKILLS.map((item) => {
                        const isExcluded = excludedSkills.some((s) => s.id === item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleToggleExcludeSkill(item)}
                            className={cn(
                              "border px-2 py-0.5 font-mono text-xs transition-colors",
                              isExcluded
                                ? "border-danger bg-danger/10 text-danger font-bold"
                                : "border-border text-text-muted hover:border-text-secondary",
                            )}
                          >
                            {isExcluded ? "✕ " : "+ "}
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOTTOM ACTION BAR */}
        <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6">
          {/* Live Vacancy Match Counter */}
          <div className="flex items-center justify-between bg-bg px-4 py-3 border border-border">
            <div className="flex items-center gap-2">
              <span className="text-accent animate-pulse font-mono text-sm">🔥</span>
              <span className="font-mono text-xs text-text-primary">
                {isCounting ? (
                  <span className="text-text-muted">Рахуємо активні вакансії…</span>
                ) : matchingCount !== null && matchingCount > 0 ? (
                  <>
                    Знайдено <strong className="text-accent font-bold">{matchingCount}</strong>{" "}
                    активних вакансій під цей стек
                  </>
                ) : (
                  <span className="text-text-muted">
                    Спробуй додати або змінити стек для ширшої вибірки
                  </span>
                )}
              </span>
            </div>
            <span className="hidden font-mono text-2xs text-text-muted sm:inline">
              DOU + Djinni без дублів
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Primary Action: Telegram Subscription */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={isSubmitting || selectedSkills.length === 0}
              onClick={handleTelegramSubscribe}
              className="flex-1"
            >
              <PaperPlaneTiltIcon weight="fill" className="h-5 w-5" />
              <span>{isSubmitting ? "Створюємо радар…" : "Отримувати нові в Telegram →"}</span>
            </Button>

            {/* Secondary Action: Browse Vacancies */}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleViewVacancies}
              className="sm:w-auto"
            >
              <span>Дивитися зараз</span>
              {matchingCount !== null && matchingCount > 0 ? (
                <span className="ml-1 text-accent">({matchingCount})</span>
              ) : (
                <ArrowRightIcon className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-center font-mono text-2xs text-text-muted">
            ⚡ One-tap активація: без спаму, сповіщення лише при появі нових перевірених вакансій
          </p>
        </div>
      </div>
    </div>
  );
}
