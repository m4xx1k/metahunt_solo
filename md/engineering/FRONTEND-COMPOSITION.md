# Composition — keep changes localised in `apps/web`

How to add UI without making future changes hunt down 30 files. Sibling to [`FRONTEND.md`](FRONTEND.md): that doc is *patterns* (handlers, fetching, state); this one is *structure* (tokens, variants, composition, dependency direction).

Read first: [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md) for the 3-tier rule, [`DESIGN.md`](DESIGN.md) for SOLID/DRY/YAGNI/rule-of-three. This file does not restate them — it applies them to UI.

## The single source rule

Every visual decision lives in exactly one place. Components reference; never restate.

| Decision               | Source of truth                      | How to use                                              |
|------------------------|--------------------------------------|---------------------------------------------------------|
| Color                  | `app/globals.css` `@theme inline`    | `bg-bg-card`, `text-accent`, `border-border-strong`     |
| Font                   | same                                 | `font-display`, `font-body`, `font-mono`                |
| Shadow                 | same                                 | `shadow-brut`, `shadow-brut-sm`, `shadow-brut-lg`       |
| Radius                 | same (currently all `0` — sharp)     | `rounded`, `rounded-sm`                                 |
| Spacing                | Tailwind scale                       | `gap-*`, `p-*`, `mt-*`                                  |
| Component appearance   | the component file itself            | imported by consumers; never re-declared                |

If you touch `#FFB380`, `style={{ color: … }}`, `mt-[13px]`, or duplicate a `cn(…)` combo across two files, the rule is broken — fix at source, not at use-site.

**Threshold for adding a new token:** the value lands in 2+ components AND has semantic intent (`warning`, not `ochre`). One-off shades stay local.

## Variants over conditionals

A pill with `ok / warn / error` states is a variant problem, not an `if` problem.

```tsx
// ❌ logic in JSX — every new state edits the chain
<span className={status === "ok" ? "text-success" : status === "warn" ? "text-accent" : "text-danger"} />

// ✅ lookup at top of file — adding a state edits one line
const variants = {
  ok:    "border-success text-success",
  warn:  "border-accent text-accent",
  error: "border-danger text-danger",
} satisfies Record<Status, string>;

<span className={`border px-2 ${variants[status]}`} />
```

When variants get compound (`size × intent × loading`), reach for `class-variance-authority` (already a peer dep of shadcn). For ≤4 variants on one axis, plain object lookup beats the dependency.

Variants ALWAYS sit at the top of the file, separate from JSX. JSX references the lookup.

## Composition over prop explosion

If a primitive's visual props grow past ~5, it's two components, not one.

```tsx
// ❌ every section needs a new prop
<Card title="" subtitle="" headerActions={…} body={…} footer={…} />

// ✅ slots — open for extension, no edits to Card
<Card>
  <Card.Header>
    <Card.Title>Pipeline</Card.Title>
    <Card.Actions><Refresh /></Card.Actions>
  </Card.Header>
  <Card.Body>{children}</Card.Body>
</Card>
```

YAGNI gate (from FRONTEND.md): only compound when the prop-based form would carry 4+ structural props. Two-prop primitives stay flat.

## `components/ui/` (shadcn) vs `components/ui-kit/` (project)

Two visual languages live side by side; don't mix them inside one widget.

- **`components/ui-kit/`** — bespoke. Brut-shadow, sharp radius, accent-on-bg. Default for everything: dashboard widgets, landing sections, internal pages.
- **`components/ui/`** — shadcn, vendored via CLI. Use when shadcn solves a hard primitive (`Dialog`, `Combobox`, `Command`, `Tooltip`) and rebuilding from scratch costs days.

Rules:

- A `Card` from `ui-kit/` should not contain a `Button` from `ui/`. Pick a language per surface.
- When a shadcn primitive lands, restyle its vendored file inline to match the brut language. That is what shadcn is for — don't wrap it in a `<MyButton>` adapter.
- New primitive default: extend `ui-kit/`. Reach for shadcn only when reaching for shadcn would save days, not minutes.

## Where styles live

Default: Tailwind utility classes in JSX.

Escape hatches in order of preference:

1. Tailwind utility (90% of cases).
2. `cn(…)` helper combining utilities — when the same combo appears in 2+ places within the same component file.
3. Component-private `<Component>.module.css` with `@apply` — only when Tailwind is awkward (`grid-template-areas`, complex `:has()` chains).
4. `app/globals.css` — only for tokens, `@layer base`, browser overrides (autofill, scrollbars). NEVER for component-specific rules.

`style={{ … }}` is allowed only for runtime-derived values (sparkline width, donut stroke offset). Static visuals always go to classes.

## Dependency direction

```
app/(group)/<route>/_components/      ← can import everything
components/shared/, components/data/  ← can import ui-kit, lib
components/ui-kit/, components/ui/    ← imports nothing project-specific
lib/                                  ← imports types, never React from app/
```

A primitive that imports from `app/(…)` has snuck domain knowledge in. Invert via props or demote to where it actually belongs.

Self-check on any new file: list its imports. If a tier-1 path imports a tier-3 path, it's not a tier-1 component.

## Rule of three for components

From [`DESIGN.md`](DESIGN.md): 1st use inline, 2nd note duplication, 3rd extract. Applied to UI:

- **Page-private (tier 3) is the default starting point** for every new component. No exceptions.
- **Promote** to `components/data/` or `components/shared/` only when the SECOND consuming page imports it. Move the file; do not re-export.
- **Demote** when the second consumer disappears. A tier-2 with one consumer is technical debt — kill it.

A premature primitive is harder to remove than a small duplication is to live with.

## Anti-patterns

- Passing color or pixel values as props (`color="orange"`, `width={240}`). Pass intent (`variant="accent"`, `size="md"`). The component owns its visual decisions.
- Building a `<ThemeProvider>` or theme context. CSS vars on `:root` are the theme — switching dark/light = swapping var values, not a context tree.
- Creating a tier-2 file before the second consumer exists. "I'll use this on three pages soon" is YAGNI.
- Re-exporting a tier-3 component from tier-2 to "make it shared". Move the source file.
- Wrapping a primitive only to rename it (`<KpiPill>` returning `<Pill variant="ok" />`). Configure or compose; don't proxy.
- An `index.ts` barrel that re-exports everything in a folder. Causes circular imports and breaks tree-shaking; let consumers import the file directly.

## The change-localisation test

Before opening a PR, ask: "If I want to change the accent color, the card chrome, or the failed-state styling — how many files do I touch?"

- Accent color → 1 line in `globals.css`.
- Card chrome → 1 component file.
- Failed-state styling → 1 variants map.

If any of those answers is `> 1`, the work is leaking across files and the structure above is the fix.

## Cross-links

- [`apps/web/CLAUDE.md#structure--the-3-tier-rule`](../../apps/web/CLAUDE.md) — tier definitions, layout, dev scripts.
- [`FRONTEND.md`](FRONTEND.md) — patterns: handlers, fetching, state, forms.
- [`DESIGN.md`](DESIGN.md) — SOLID, DRY, KISS, YAGNI, anti-patterns.
- [`STYLE.md`](STYLE.md) — formatting, naming, TS rules.
