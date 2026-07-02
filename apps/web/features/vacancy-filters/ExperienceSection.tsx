"use client";

import { EnumSection } from "@/ui/inputs/EnumSection";

// Experience buttons over a vacancy's stated MINIMUM required years. Multi-select
// (OR), exact "0".."5" + "6+" (≥6); the "6+" meaning is mirrored in feed.service.ts.
const EXPERIENCE_OPEN_TOKEN = "6+";

const EXPERIENCE_OPTIONS = ["0", "1", "2", "3", "4", "5", EXPERIENCE_OPEN_TOKEN].map(
  (id) => ({ id, label: id }),
);

export function ExperienceSection({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <EnumSection
      title="experience"
      options={EXPERIENCE_OPTIONS}
      multiple
      activeIds={selected}
      onToggle={onToggle}
      singleRow
    />
  );
}
