"use client";

import Link from "next/link";

import { useSession } from "@/features/auth/use-session";
import type { VacancyDto } from "@/lib/api/vacancies";

const LINK = "text-accent underline-offset-2 hover:underline";

export function AdminLinks({ vacancy }: { vacancy: VacancyDto }) {
  const { roles } = useSession();
  if (!roles.includes("admin")) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
      <span>admin</span>
      {vacancy.uniqueVacancyId ? (
        <Link href={`/dashboard/dedupe?group=${vacancy.uniqueVacancyId}`} className={LINK}>
          dedupe group
        </Link>
      ) : null}
      <Link href={`/dashboard/records/${vacancy.rssRecordId}`} className={LINK}>
        rss record
      </Link>
      {vacancy.link ? (
        <a href={vacancy.link} target="_blank" rel="noreferrer" className={LINK}>
          original ↗
        </a>
      ) : null}
    </div>
  );
}
