// Market-snapshot filter widgets (landing page-private). Consumers map
// into FilterAggregates and drive the sections with a FiltersApi
// implementation (currently the URL-backed useUrlFilters on landing).

// Generic primitives now live in tier-2 (components/data/filters), reused by
// the reverse-ATS filter bar; re-exported here so feed consumers are unchanged.
export type {
  OptionRow,
  SourceOption,
  SkillStat,
  FilterAggregates,
  FilterState,
  FiltersApi,
} from "@/components/data/filters/types";
export { EMPTY_FILTERS } from "@/components/data/filters/types";
export { Section } from "@/components/data/filters/Section";
export { EnumSection } from "@/components/data/filters/EnumSection";

// Feed-specific sections stay page-private.
export { SelectRow } from "./SelectRow";
export { RoleSection } from "./RoleSection";
export { TrackTree } from "./TrackTree";
export { FacetSection, type Facet } from "./FacetSection";
export { SkillsSection } from "./SkillsSection";
export { SourceSection } from "./SourceSection";
export { PerksFilter } from "./PerksFilter";
export { ActiveFiltersBar } from "./ActiveFiltersBar";
