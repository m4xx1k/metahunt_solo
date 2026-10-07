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
  CheckSquareIcon,
  FileArrowUpIcon,
  PaperPlaneTiltIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_FORMAT_OPTIONS,
} from "@/features/vacancy-filters/enum-options";
import { cvApi } from "@/lib/api/cv";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { subscriptionsApi, type SubscriptionFilter } from "@/lib/api/subscriptions";
import {
  vacanciesApi,
  type EmploymentType,
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

// Canonical verified roles matching the live database (n.slug and n.canonical_name)
const DEFAULT_ROLES: SelectOption[] = [
  { id: "backend-developer", label: "Backend Developer", count: 2899 },
  { id: "full-stack-developer", label: "Full Stack Developer", count: 1799 },
  { id: "devops-engineer", label: "DevOps Engineer", count: 1260 },
  { id: "software-engineer", label: "Software Engineer", count: 1228 },
  { id: "qa-engineer", label: "QA Engineer", count: 1100 },
  { id: "frontend-developer", label: "Frontend Developer", count: 1050 },
  { id: "data-engineer", label: "Data Engineer", count: 850 },
  { id: "mobile-developer", label: "Mobile Developer", count: 650 },
];

const DEFAULT_SKILLS: SelectOption[] = [
  { id: "python", label: "Python", count: 5728 },
  { id: "docker", label: "Docker", count: 4044 },
  { id: "sql", label: "SQL", count: 3892 },
  { id: "aws", label: "AWS", count: 3827 },
  { id: "ci-cd", label: "CI/CD", count: 3413 },
  { id: "postgresql", label: "PostgreSQL", count: 3310 },
  { id: "typescript", label: "TypeScript", count: 3100 },
  { id: "kubernetes", label: "Kubernetes", count: 2400 },
  { id: "react", label: "React", count: 2300 },
  { id: "go", label: "Go", count: 1200 },
  { id: "node-js", label: "Node.js", count: 1100 },
  { id: "redis", label: "Redis", count: 900 },
];

const DEFAULT_DOMAINS: SelectOption[] = [
  { id: "fintech", label: "Fintech", count: 1857 },
  { id: "deftech", label: "DefTech", count: 2054 },
  { id: "saas", label: "SaaS", count: 1177 },
  { id: "ai", label: "AI", count: 1046 },
  { id: "healthtech", label: "HealthTech", count: 841 },
  { id: "ecommerce", label: "Ecommerce", count: 699 },
  { id: "cybersecurity", label: "Cybersecurity", count: 412 },
  { id: "adtech", label: "AdTech", count: 437 },
];

const DEFAULT_EXCLUDE_SKILLS: SelectOption[] = [
  { id: "php", label: "PHP", count: 850 },
  { id: "1c", label: "1C", count: 120 },
  { id: "wordpress", label: "WordPress", count: 210 },
  { id: "ruby", label: "Ruby", count: 180 },
];

const DEFAULT_EXCLUDE_DOMAINS: SelectOption[] = [
  { id: "igaming", label: "iGaming / Gambling", count: 977 },
  { id: "crypto", label: "Crypto / Web3", count: 530 },
  { id: "adult", label: "Adult", count: 140 },
];

const EXPERIENCE_OPTIONS: SelectOption[] = [
  { id: "0", label: "0–1 yr" },
  { id: "1", label: "1–2 yrs" },
  { id: "2", label: "2–3 yrs" },
  { id: "3", label: "3–5 yrs" },
  { id: "5", label: "5+ yrs" },
];

export interface HomeRadarBlockProps {
  className?: string;
  roleCatalog?: NodeFacet[];
  skillCatalog?: NodeFacet[];
  domainCatalog?: NodeFacet[];
}

export function HomeRadarBlock({
  className,
  roleCatalog: initialRoles,
  skillCatalog: initialSkills,
  domainCatalog: initialDomains,
}: HomeRadarBlockProps = {}) {
  const router = useRouter();
  const analytics = useAnalytics();
  const { isLoggedIn } = useSession();

  // Core filter selections (canonical database node IDs)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(["backend-developer"]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([
    "go",
    "postgresql",
    "docker",
  ]);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);

  // Additional criteria
  const [selectedExcludedDomainIds, setSelectedExcludedDomainIds] = useState<string[]>([]);
  const [selectedExcludedSkillIds, setSelectedExcludedSkillIds] = useState<string[]>([]);
  const [selectedWorkFormats, setSelectedWorkFormats] = useState<string[]>(["REMOTE"]);
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([]);
  const [selectedEnglish, setSelectedEnglish] = useState<string | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<string[]>([]);
  const [selectedEmployment, setSelectedEmployment] = useState<string[]>([]);
  const [hasNoTest, setHasNoTest] = useState(false);
  const [hasReservation, setHasReservation] = useState(false);

  // Accordion toggle
  const [isExtraOpen, setIsExtraOpen] = useState(false);

  // CV Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedCvLabel, setParsedCvLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit in flight
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verified catalogs (fetched client-side only when not provided as server props)
  const { data: rolesData } = useQuery({
    queryKey: ["facets-roles"],
    queryFn: () => facetsApi.roles(),
    staleTime: 5 * 60_000,
    enabled: !initialRoles,
  });

  const { data: skillsData } = useQuery({
    queryKey: ["facets-skills"],
    queryFn: () => facetsApi.skills(),
    staleTime: 5 * 60_000,
    enabled: !initialSkills,
  });

  const { data: domainsData } = useQuery({
    queryKey: ["facets-domains"],
    queryFn: () => facetsApi.domains(),
    staleTime: 5 * 60_000,
    enabled: !initialDomains,
  });

  const rawRoles = initialRoles ?? rolesData?.roles;
  const rawSkills = initialSkills ?? skillsData?.skills;
  const rawDomains = initialDomains ?? domainsData?.domains;

  // Options mapping
  const roleOptions = useMemo<SelectOption[]>(() => {
    if (!rawRoles || rawRoles.length === 0) return DEFAULT_ROLES;
    return rawRoles.map((r) => ({
      id: r.id,
      label: r.name,
      count: r.count,
    }));
  }, [rawRoles]);

  const skillOptions = useMemo<SelectOption[]>(() => {
    if (!rawSkills || rawSkills.length === 0) return DEFAULT_SKILLS;
    return rawSkills.map((s) => ({
      id: s.id,
      label: s.name,
      count: s.count,
      kind: s.kind ?? undefined,
    }));
  }, [rawSkills]);

  const domainOptions = useMemo<SelectOption[]>(() => {
    if (!rawDomains || rawDomains.length === 0) return DEFAULT_DOMAINS;
    return rawDomains.map((d) => ({
      id: d.id,
      label: d.name,
      count: d.count,
    }));
  }, [rawDomains]);

  const excludeDomainOptions = useMemo<SelectOption[]>(() => {
    if (!rawDomains || rawDomains.length === 0) return DEFAULT_EXCLUDE_DOMAINS;
    return rawDomains.map((d) => ({
      id: d.id,
      label: d.name,
      count: d.count,
    }));
  }, [rawDomains]);

  const excludeSkillOptions = useMemo<SelectOption[]>(() => {
    if (!rawSkills || rawSkills.length === 0) return DEFAULT_EXCLUDE_SKILLS;
    return rawSkills.slice(0, 50).map((s) => ({
      id: s.id,
      label: s.name,
      count: s.count,
    }));
  }, [rawSkills]);

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

  const handleToggleDomain = useCallback((domainId: string) => {
    setSelectedDomainIds((prev) =>
      prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId],
    );
  }, []);

  const handleToggleExcludedDomain = useCallback((domainId: string) => {
    setSelectedExcludedDomainIds((prev) =>
      prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId],
    );
  }, []);

  const handleToggleExcludedSkill = useCallback((skillId: string) => {
    setSelectedExcludedSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId],
    );
  }, []);

  const handleToggleFormat = useCallback((formatId: string) => {
    setSelectedWorkFormats((prev) =>
      prev.includes(formatId) ? prev.filter((id) => id !== formatId) : [...prev, formatId],
    );
  }, []);

  const handleToggleSeniority = useCallback((senId: string) => {
    setSelectedSeniorities((prev) =>
      prev.includes(senId) ? prev.filter((id) => id !== senId) : [...prev, senId],
    );
  }, []);

  const handleToggleExperience = useCallback((expId: string) => {
    setSelectedExperience((prev) =>
      prev.includes(expId) ? prev.filter((id) => id !== expId) : [...prev, expId],
    );
  }, []);

  const handleToggleEmployment = useCallback((empId: string) => {
    setSelectedEmployment((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
  }, []);

  // Compute effective domain IDs taking exclusions into account
  const effectiveDomainIds = useMemo(() => {
    if (selectedDomainIds.length > 0) {
      // If user selected explicit domains, remove any that are excluded
      return selectedDomainIds.filter((d) => !selectedExcludedDomainIds.includes(d));
    }
    if (selectedExcludedDomainIds.length > 0 && domainOptions.length > 0) {
      // If user specified exclusions without explicit inclusions, include all domains except excluded
      return domainOptions.map((d) => d.id).filter((d) => !selectedExcludedDomainIds.includes(d));
    }
    return undefined;
  }, [selectedDomainIds, selectedExcludedDomainIds, domainOptions]);

  // Filter payload for subscription
  const currentFilter = useMemo<SubscriptionFilter>(() => {
    return {
      roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      domainIds:
        effectiveDomainIds && effectiveDomainIds.length > 0 ? effectiveDomainIds : undefined,
      excludedSkillIds: selectedExcludedSkillIds.length > 0 ? selectedExcludedSkillIds : undefined,
      workFormats:
        selectedWorkFormats.length > 0 ? (selectedWorkFormats as WorkFormat[]) : undefined,
      seniorities:
        selectedSeniorities.length > 0 ? (selectedSeniorities as Seniority[]) : undefined,
      englishLevels: selectedEnglish ? [selectedEnglish as EnglishLevel] : undefined,
      employmentTypes:
        selectedEmployment.length > 0 ? (selectedEmployment as EmploymentType[]) : undefined,
      experienceYears: selectedExperience.length > 0 ? selectedExperience : undefined,
      hasTestAssignment: hasNoTest ? false : undefined,
      hasReservation: hasReservation ? true : undefined,
    };
  }, [
    selectedRoleIds,
    selectedSkillIds,
    effectiveDomainIds,
    selectedExcludedSkillIds,
    selectedWorkFormats,
    selectedSeniorities,
    selectedEnglish,
    selectedEmployment,
    selectedExperience,
    hasNoTest,
    hasReservation,
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
    if (effectiveDomainIds && effectiveDomainIds.length > 0) {
      params.set("domains", effectiveDomainIds.join(","));
    }
    if (selectedExcludedSkillIds.length > 0) {
      params.set("excludeSkills", selectedExcludedSkillIds.join(","));
    }
    if (selectedWorkFormats.length > 0) params.set("workFormats", selectedWorkFormats.join(","));
    if (selectedSeniorities.length > 0) params.set("seniorities", selectedSeniorities.join(","));
    if (selectedEnglish) params.set("english", selectedEnglish);
    if (selectedEmployment.length > 0) params.set("employment", selectedEmployment.join(","));
    if (selectedExperience.length > 0) params.set("experience", selectedExperience.join(","));
    if (hasNoTest) params.set("test", "false");
    if (hasReservation) params.set("reservation", "true");

    router.push(`/?${params.toString()}`, { scroll: false });

    const feedElement = document.getElementById("feed-shell") || document.querySelector("main");
    feedElement?.scrollIntoView({ behavior: "smooth" });
  }, [
    selectedRoleIds,
    selectedSkillIds,
    effectiveDomainIds,
    selectedExcludedSkillIds,
    selectedWorkFormats,
    selectedSeniorities,
    selectedEnglish,
    selectedEmployment,
    selectedExperience,
    hasNoTest,
    hasReservation,
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
      <div className="flex flex-col gap-1.5">
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

      {/* 3. Core Selectors (Role + Skills + Domain in 3-column layout) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Role Column */}
        <div className="border border-border bg-bg/50">
          <MultiSelect
            title="Role"
            options={roleOptions}
            selected={selectedRoleIds}
            selectedOptions={roleOptions}
            onToggle={handleToggleRole}
            searchable
            searchPlaceholder="Search role..."
            layout="wrap"
            max={6}
          />
        </div>

        {/* Skills Column */}
        <div className="border border-border bg-bg/50">
          <MultiSelect
            title="Tech Stack"
            options={skillOptions}
            selected={selectedSkillIds}
            selectedOptions={skillOptions}
            onToggle={handleToggleSkill}
            searchable
            searchPlaceholder="Search skill..."
            layout="wrap"
            max={8}
          />
        </div>

        {/* Domain Column */}
        <div className="border border-border bg-bg/50">
          <MultiSelect
            title="Domain"
            options={domainOptions}
            selected={selectedDomainIds}
            selectedOptions={domainOptions}
            onToggle={handleToggleDomain}
            searchable
            searchPlaceholder="Search domain..."
            layout="wrap"
            max={6}
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
            <span className="font-bold text-text-primary">Additional criteria</span>
            <span className="text-2xs text-text-muted">
              (exclude domain/skills, format, seniority, experience, english, perks)
            </span>
          </span>
          {isExtraOpen ? (
            <CaretUpIcon className="h-4 w-4" />
          ) : (
            <CaretDownIcon className="h-4 w-4" />
          )}
        </button>

        {isExtraOpen && (
          <div className="flex flex-col gap-5 border-t border-border p-4">
            {/* Row 1: Exclusions (Domains & Skills to avoid) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="border border-border bg-bg/50 p-1">
                <MultiSelect
                  title="Exclude Domains"
                  options={excludeDomainOptions}
                  selected={selectedExcludedDomainIds}
                  onToggle={handleToggleExcludedDomain}
                  searchable
                  searchPlaceholder="Exclude domains (iGaming, Crypto...)"
                  layout="wrap"
                  max={6}
                />
              </div>

              <div className="border border-border bg-bg/50 p-1">
                <MultiSelect
                  title="Exclude Skills"
                  options={excludeSkillOptions}
                  selected={selectedExcludedSkillIds}
                  onToggle={handleToggleExcludedSkill}
                  searchable
                  searchPlaceholder="Exclude skills (PHP, 1C...)"
                  layout="wrap"
                  max={6}
                />
              </div>
            </div>

            {/* Row 2: Format, Seniority, English, Experience */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <EnumSection
                title="Work Format"
                options={WORK_FORMAT_OPTIONS}
                multiple
                activeIds={selectedWorkFormats}
                onToggle={handleToggleFormat}
              />

              <EnumSection
                title="Seniority"
                options={SENIORITY_OPTIONS}
                multiple
                activeIds={selectedSeniorities}
                onToggle={handleToggleSeniority}
              />

              <EnumSection
                title="Experience"
                options={EXPERIENCE_OPTIONS}
                multiple
                activeIds={selectedExperience}
                onToggle={handleToggleExperience}
              />

              <EnumSection
                title="English"
                options={ENGLISH_OPTIONS}
                activeId={selectedEnglish}
                onChange={(id) => setSelectedEnglish(id)}
              />
            </div>

            {/* Row 3: Employment Type & Perks */}
            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <EnumSection
                title="Employment"
                options={EMPLOYMENT_OPTIONS}
                multiple
                activeIds={selectedEmployment}
                onToggle={handleToggleEmployment}
              />

              {/* Perks checkboxes */}
              <div className="flex flex-col justify-center gap-3 bg-bg/40 p-3 border border-border">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  Perks & Requirements:
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setHasNoTest((v) => !v)}
                    className="flex items-center gap-2 font-mono text-xs text-text-secondary hover:text-text-primary select-none"
                  >
                    {hasNoTest ? (
                      <CheckSquareIcon weight="fill" className="h-4 w-4 text-accent" />
                    ) : (
                      <SquareIcon className="h-4 w-4 text-text-muted" />
                    )}
                    <span>No test assignment</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasReservation((v) => !v)}
                    className="flex items-center gap-2 font-mono text-xs text-text-secondary hover:text-text-primary select-none"
                  >
                    {hasReservation ? (
                      <CheckSquareIcon weight="fill" className="h-4 w-4 text-accent" />
                    ) : (
                      <SquareIcon className="h-4 w-4 text-text-muted" />
                    )}
                    <span>Military reservation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Bottom Action & Conversion Strip */}
      <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Live Matching Count */}
        <div className="flex items-center gap-2.5 font-mono text-sm">
          <span className="text-accent animate-pulse text-base">🔥</span>
          <span className="text-text-primary">
            {isCounting ? (
              <span className="text-text-muted">Calculating matches…</span>
            ) : liveCount !== null ? (
              <>
                <strong className="text-accent font-bold text-base">{liveCount}</strong> matching
                jobs · 0 duplicates
              </>
            ) : (
              "Live feed synced"
            )}
          </span>
        </div>

        {/* Prominent CTA Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleViewInFeed}
            className="border-2 border-border-strong text-text-primary px-5 py-3 font-display font-bold text-xs uppercase tracking-wider shadow-brut-sm hover:border-accent hover:text-accent hover:shadow-brut-xs"
          >
            <span>View in feed</span>
            <ArrowDownIcon className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={isSubmitting || selectedSkillIds.length === 0}
            onClick={handleTelegramSubscribe}
            className="border-2 border-accent bg-accent text-bg px-6 py-3 font-display font-black text-xs uppercase tracking-wider shadow-brut hover:shadow-brut-xs"
          >
            <PaperPlaneTiltIcon weight="fill" className="h-4 w-4" />
            <span>{isSubmitting ? "Connecting…" : "Get alerts in Telegram →"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
