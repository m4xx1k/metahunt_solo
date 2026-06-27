// Domain-free option shape for the generic selection widgets (MultiSelect,
// EnumSection). `count` is optional decoration — widgets render labels and may
// sort by it. Domain types (e.g. vacancy-filters `OptionRow`) are structurally
// compatible: they satisfy this shape, so no mapping is needed at call sites.
export interface SelectOption {
  id: string;
  label: string;
  count?: number;
}
