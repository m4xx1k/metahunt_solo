"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

import type { VacancyAggregates } from "@/lib/api/aggregates";
import { TotalCounter } from "./TotalCounter";
import { TopSkills } from "./TopSkills";
import { SeniorityBars } from "./SeniorityBars";
import { TopRoles } from "./TopRoles";
import { FormatDonut } from "./FormatDonut";

type Props = {
  aggregates: VacancyAggregates;
};

export function Snapshot({ aggregates: a }: Props) {
  const reduced = useReducedMotion();
  const tileVariants: Variants = reduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: "easeOut" },
        },
      };

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-16 pb-12 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight text-text-primary md:text-5xl">
            Метахант
          </h1>
          <p className="max-w-[520px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            агрегує IT-вакансії з DOU та Джині, нормалізує роль / стек / формат
            і викладає одним списком.
          </p>
        </div>
        <TotalCounter
          total={a.total}
          lastSyncAt={a.lastSyncAt}
          sources={a.sources}
        />
      </div>
      <motion.div
        className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="show"
        transition={reduced ? undefined : { staggerChildren: 0.08 }}
      >
        <motion.div variants={tileVariants}>
          <TopSkills skills={a.topSkills} totalVacancies={a.total} />
        </motion.div>
        <motion.div variants={tileVariants} className="flex flex-col gap-4">
          <SeniorityBars dist={a.seniorityDist} />
          <TopRoles roles={a.topRoles} totalVacancies={a.total} />
        </motion.div>
        <motion.div variants={tileVariants}>
          <FormatDonut
            dist={a.workFormatDist}
            reservationTrueCount={a.reservationTrueCount}
            total={a.total}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
