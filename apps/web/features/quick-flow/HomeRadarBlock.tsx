"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FileArrowUpIcon,
  PaperPlaneTiltIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import {
  ENGLISH_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_FORMAT_OPTIONS,
} from "@/features/vacancy-filters/enum-options";
import { cvApi } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import { subscriptionsApi, type SubscriptionFilter } from "@/lib/api/subscriptions";
import {
  vacanciesApi,
  type EnglishLevel,
  type Seniority,
  type WorkFormat,
} from "@/lib/api/vacancies";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { cn } from "@/lib/utils";
import { Button, Tag } from "@/ui";
import { EnumSection } from "@/ui/inputs/EnumSection";
import { MultiSelect } from "@/ui/inputs/MultiSelect";
import type { SelectOption } from "@/ui/inputs/types";

// High-confidence defaults so the widget renders immediately before catalogs resolve
const DEFAULT_ROLES: SelectOption[] = [
  { id: "backend-engineer", label: "Backend Engineer", count: 2450 },
  { id: "frontend-engineer", label: "Frontend Engineer", count: 1820 },
  { id: "full-stack-engineer", label: "Full Stack Engineer", count: 1530 },
  { id: "devops-engineer", label: "DevOps Engineer", count: 1200 },
  { id: "qa-engineer", label: "QA Engineer", count: 1100 },
  { id: "mobile-developer", label: "Mobile Developer", count: 650 },
  { id: "data-engineer", label: "Data Engineer", count: 580 },
];

const DEFAULT_SKILLS: SelectOption[] = [
  { id: "go", label: "Go", count: 350 },
  { id: "postgresql", label: "PostgreSQL", count: 1400 },
  { id: "docker", label: "Docker", count: 1600 },
  { id: "kubernetes", label: "Kubernetes", count: 950 },
  { id: "python", label: "Python", count: 1200 },
  { id: "typescript", label: "TypeScript", count: 1500 },
  { id: "react", label: "React", count: 1300 },
  { id: "node-js", label: "Node.js", count: 850 },
  { id: "aws", label: "AWS", count: 1100 },
  { id: "redis", label: "Redis", count: 600 },
];

export function HomeRadarBlock({ className }: { className?: string }) {
  const router = useRouter();
  const analytics = useAnalytics();
  const { isLoggedIn } = useSession();

  // Core filter selections
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(["backend-engineer"]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([
    "go",
    "postgresql",
    "docker",
  ]);

  // Extra filter selections
  const [selectedWorkFormats, setSelectedWorkFormats] = useState<string[]>(["REMOTE"]);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([]);
  const [selectedEnglish, setSelectedEnglish] = useState<string | null>(null);

  // Accordion toggle
  const [isExtraOpen, setIsExtraOpen] = useState(false);

  // CV Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedCvLabel, setParsedCvLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit in flight
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch verified catalogs
  const { data: rolesData } = useQuery({
    queryKey: ["facets-roles"],
    queryFn: () => facetsApi.roles(),
    staleTime: 5 * 60_000,
  });

  const { data: skillsData } = useQuery({
    queryKey: ["facets-skills"],
    queryFn: () => facetsApi.skills(),
    staleTime: 5 * 60_000,
  });

  const { data: domainsData } = useQuery({
    queryKey: ["facets-domains"],
    queryFn: () => facetsApi.domains(),
    staleTime: 5 * 60_000,
  });

  // Map to SelectOption
  const roleOptions = useMemo<SelectOption[]>(() => {
    if (!rolesData?.roles || rolesData.roles.length === 0) return DEFAULT_ROLES;
    return rolesData.roles.map((r) => ({
      id: r.id,
      label: r.name,
      count: r.count,
    }));
  }, [rolesData]);

  const skillOptions = useMemo<SelectOption[]>(() => {
    if (!skillsData?.skills || skillsData.skills.length === 0) return DEFAULT_SKILLS;
    return skillsData.skills.map((s) => ({
      id: s.id,
      label: s.name,
      count: s.count,
      kind: s.kind ?? undefined,
    }));
  }, [skillsData]);

  const domainOptions = useMemo<SelectOption[]>(() => {
    if (!domainsData?.domains || domainsData.domains.length === 0) return [];
    return domainsData.domains.map((d) => ({
      id: d.id,
      label: d.name,
      count: d.count,
    }));
  }, [domainsData]);

  // Toggle callbacks
  const handleToggleRole = useCallback((roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }, []);

  const handleToggleSkill = useCallback((skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId],
    );
  }, []);

  const handleToggleFormat = useCallback((formatId: string) => {
    setSelectedWorkFormats((prev) =>
      prev.includes(formatId) ? prev.filter((id) => id !== formatId) : [...prev, formatId],
    );
  }, []);

  const handleToggleDomain = useCallback((domainId: string) => {
    setSelectedDomainIds((prev) =>
      prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId],
    );
  }, []);

  const handleToggleSeniority = useCallback((senId: string) => {
    setSelectedSeniorities((prev) =>
      prev.includes(senId) ? prev.filter((id) => id !== senId) : [...prev, senId],
    );
  }, []);

  // Filter payload for subscription
  const currentFilter = useMemo<SubscriptionFilter>(() => {
    return {
      roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      domainIds: selectedDomainIds.length > 0 ? selectedDomainIds : undefined,
      workFormats:
        selectedWorkFormats.length > 0 ? (selectedWorkFormats as WorkFormat[]) : undefined,
      seniorities:
        selectedSeniorities.length > 0 ? (selectedSeniorities as Seniority[]) : undefined,
      englishLevels: selectedEnglish ? [selectedEnglish as EnglishLevel] : undefined,
    };
  }, [
    selectedRoleIds,
    selectedSkillIds,
    selectedDomainIds,
    selectedWorkFormats,
    selectedSeniorities,
    selectedEnglish,
  ]);

  // Live count query
  const { data: countData, isFetching: isCounting } = useQuery({
    queryKey: ["home-radar-count", currentFilter],
    queryFn: () => vacanciesApi.list({ ...currentFilter, pageSize: 1 }),
    staleTime: 30_000,
  });

  const liveCount = countData?.total ?? null;

  // Handle CV file drop or selection
  const handleCvUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        analytics.cvUpload(info.reused);

        // Populate skills
        if (info.matched && info.matched.length > 0) {
          setSelectedSkillIds(info.matched.map((m) => m.id));
        }

        // Match role if resolved
        if (info.role) {
          const roleLower = info.role.toLowerCase();
          const match = roleOptions.find(
            (r) =>
              r.label.toLowerCase().includes(roleLower) ||
              roleLower.includes(r.label.toLowerCase()),
          );
          if (match) setSelectedRoleIds([match.id]);
        }

        // Match seniority if resolved
        if (info.seniority) {
          const senUpper = info.seniority.toUpperCase();
          if (["JUNIOR", "MIDDLE", "SENIOR", "LEAD"].includes(senUpper)) {
            setSelectedSeniorities([senUpper]);
          }
        }

        setParsedCvLabel(`${info.matched.length} skills detected`);
        toast.success(`CV parsed: ${info.matched.length} skills auto-filled`);
      } catch (e) {
        analytics.cvUploadFailed();
        toast.error(e instanceof Error ? e.message : "Failed to process CV");
      } finally {
        setIsUploading(false);
      }
    },
    [analytics, roleOptions],
  );

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
      toast.success("Opening Telegram to activate your job radar!");
    } catch {
      analytics.subscriptionCreateFailed("feed");
      tab?.close();
      toast.error("Could not create subscription. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [analytics, currentFilter, isSubmitting]);

  // View in feed
  const handleViewInFeed = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedRoleIds.length > 0) params.set("roles", selectedRoleIds.join(","));
    if (selectedSkillIds.length > 0) params.set("skills", selectedSkillIds.join(","));
    if (selectedDomainIds.length > 0) params.set("domains", selectedDomainIds.join(","));
    if (selectedWorkFormats.length > 0) params.set("workFormats", selectedWorkFormats.join(","));
    if (selectedSeniorities.length > 0) params.set("seniorities", selectedSeniorities.join(","));
    if (selectedEnglish) params.set("english", selectedEnglish);

    router.push(`/?${params.toString()}`, { scroll: false });

    const feedElement = document.getElementById("feed-shell") || document.querySelector("main");
    feedElement?.scrollIntoView({ behavior: "smooth" });
  }, [
    selectedRoleIds,
    selectedSkillIds,
    selectedDomainIds,
    selectedWorkFormats,
    selectedSeniorities,
    selectedEnglish,
    router,
  ]);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-6 border border-border bg-bg-card p-6 shadow-brut md:p-8",
        className,
      )}
    >
      {/* 1. Header (Clean & Minimal) */}
      <div className="flex flex-col gap-2">
        <Tag>&gt; JOB RADAR</Tag>
        <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
          Vacancies matched to your exact stack.
        </h2>
      </div>

      {/* 2. Top CV Drop Strip */}
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
          if (file && !isUploading) handleCvUpload(file);
        }}
        className={cn(
          "flex flex-col items-center justify-between gap-3 border border-dashed p-4 transition-colors sm:flex-row",
          isDragging
            ? "border-accent bg-accent/10"
            : "border-border-strong bg-bg/60 hover:border-text-secondary",
        )}
      >
        <div className="flex items-center gap-3">
          <FileArrowUpIcon className="h-5 w-5 text-accent shrink-0" />
          <div className="flex flex-col text-left">
            <span className="font-display text-xs font-bold text-text-primary">
              Drop your CV to autofill (PDF, TXT)
            </span>
            <span className="font-mono text-2xs text-text-muted">
              Auto-extracts role and skills in seconds
            </span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCvUpload(file);
          }}
        />

        <div className="flex items-center gap-2">
          {parsedCvLabel ? (
            <div className="flex items-center gap-1.5 border border-success/40 bg-success/10 px-2.5 py-1 font-mono text-2xs text-success">
              <CheckCircleIcon weight="fill" className="h-3.5 w-3.5" />
              <span>{parsedCvLabel}</span>
              <button
                type="button"
                onClick={() => setParsedCvLabel(null)}
                className="ml-1 text-text-muted hover:text-text-primary"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ) : isLoggedIn ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs"
            >
              {isUploading ? "Parsing CV…" : "Browse file"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <AuthChoice label="Sign in with Telegram / Google" size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* Subtle Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <span className="relative bg-bg-card px-3 font-mono text-2xs uppercase tracking-widest text-text-muted">
          or configure manually
        </span>
      </div>

      {/* 3. Role & Skills Selectors */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="border border-border bg-bg/50">
          <MultiSelect
            title="Target Role"
            options={roleOptions}
            selected={selectedRoleIds}
            onToggle={handleToggleRole}
            searchable
            searchPlaceholder="Search role (Backend, Frontend...)"
            layout="wrap"
            max={6}
          />
        </div>

        <div className="border border-border bg-bg/50">
          <MultiSelect
            title="Tech Stack"
            options={skillOptions}
            selected={selectedSkillIds}
            onToggle={handleToggleSkill}
            searchable
            searchPlaceholder="Search skill (Go, React, Postgres...)"
            layout="wrap"
            max={8}
          />
        </div>
      </div>

      {/* 4. Additional Criteria (Collapsible) */}
      <div className="border border-border bg-bg/30">
        <button
          type="button"
          onClick={() => setIsExtraOpen((v) => !v)}
          className="flex w-full items-center justify-between p-3.5 text-left font-mono text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontalIcon className="h-3.5 w-3.5 text-accent" />
            <span className="font-bold">Additional criteria</span>
            <span className="text-2xs text-text-muted">
              (work format, domain, seniority, english)
            </span>
          </span>
          {isExtraOpen ? (
            <CaretUpIcon className="h-4 w-4" />
          ) : (
            <CaretDownIcon className="h-4 w-4" />
          )}
        </button>

        {isExtraOpen && (
          <div className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Work Format */}
            <EnumSection
              title="Work Format"
              options={WORK_FORMAT_OPTIONS}
              multiple
              activeIds={selectedWorkFormats}
              onToggle={handleToggleFormat}
            />

            {/* Seniority */}
            <EnumSection
              title="Seniority"
              options={SENIORITY_OPTIONS}
              multiple
              activeIds={selectedSeniorities}
              onToggle={handleToggleSeniority}
            />

            {/* English */}
            <EnumSection
              title="English"
              options={ENGLISH_OPTIONS}
              activeId={selectedEnglish}
              onChange={(id) => setSelectedEnglish(id)}
            />

            {/* Domain */}
            {domainOptions.length > 0 ? (
              <MultiSelect
                title="Domain"
                options={domainOptions}
                selected={selectedDomainIds}
                onToggle={handleToggleDomain}
                searchable
                searchPlaceholder="Search domain..."
                max={4}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* 5. Bottom Action & Conversion Strip */}
      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Live Matching Count */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-accent animate-pulse">🔥</span>
          <span className="text-text-primary">
            {isCounting ? (
              <span className="text-text-muted">Calculating matches…</span>
            ) : liveCount !== null ? (
              <>
                <strong className="text-accent font-bold">{liveCount}</strong> matching jobs in the
                last 30 days
              </>
            ) : (
              "Updating database..."
            )}
          </span>
        </div>

        {/* CTA Actions */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleViewInFeed}
            className="gap-1 font-mono text-xs"
          >
            <span>View in feed</span>
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isSubmitting || selectedSkillIds.length === 0}
            onClick={handleTelegramSubscribe}
            className="gap-2 text-xs"
          >
            <PaperPlaneTiltIcon weight="fill" className="h-4 w-4" />
            <span>{isSubmitting ? "Connecting…" : "Get alerts in Telegram →"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
