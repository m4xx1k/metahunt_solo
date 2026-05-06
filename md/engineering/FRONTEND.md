# Frontend — patterns for `apps/web`

Patterns specific to the React / Next.js 16 frontend. For formatting + naming + TS rules, see [STYLE.md](STYLE.md). For the 3-tier component layout (`ui-kit/` → `shared/` → `_components/`) and the `lib/api/` boundary, see [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md).

These are *patterns*, not laws. Use the smallest one that fits.

---

## Event handlers

### Named, never inline

Define handlers in the component body. Inline arrows in JSX defeat memoization, clutter markup, and make handlers untestable.

```tsx
// ❌ inline — new fn every render, unreadable
<input onChange={(e) => setQuery(e.target.value)} />

// ✅ named
const handleQueryChange = useCallback(
  (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
  [],
);
<input onChange={handleQueryChange} />
```

### Naming

| Where         | Prefix    | Example              |
|---------------|-----------|----------------------|
| Inside cmpnt  | `handle*` | `handleQueryChange`  |
| Prop callback | `on*`     | `onSelect`, `onClose`|

### Allowed exception

Trivial prop-forwarding inside `.map()` — single expression only, no logic:

```tsx
{items.map((item) => (
  <ListItem key={item.id} onSelect={() => onSelect(item.id)} />
))}
```

### Closing over a value: curried factory

When the handler needs an arg from a list item, define a factory and call it in JSX with the bound value visible:

```tsx
const handleDelete = (id: string) => () => onDelete(id);

<Button onClick={handleDelete(item.id)}>delete</Button>
```

Keeps the bound value at the call-site instead of hidden inside an inline closure.

---

## Container vs presentational

Separate data acquisition from rendering. In App Router this maps onto Server vs Client Components:

```tsx
// Server Component — does the fetching, no state, no handlers.
// Lives in app/(group)/<route>/page.tsx.
export default async function VacanciesPage() {
  const vacancies = await vacanciesApi.list();
  return <VacanciesGrid items={vacancies.items} />;
}

// Client / pure presentational — receives data via props, no fetching.
// Lives in app/(group)/<route>/_components/.
"use client";
interface Props { items: VacancyDto[] }
export function VacanciesGrid({ items }: Props) {
  return <div className="grid gap-4">{items.map(/* … */)}</div>;
}
```

Rule: pages call `lib/api/<resource>.ts` and pass plain data to `_components/`. Components stay dumb.

---

## Data fetching

### One module per resource in `lib/api/`

Typed fetcher per resource, called from Server Components. Mirror the wire contract from the producer module (see ADR-0005 — no shared `libs/contracts/` until the second consumer).

```ts
// apps/web/lib/api/vacancies.ts
export interface VacancyDto { /* mirror of etl-side contract */ }

async function get<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`vacancies api ${res.status}`);
  return res.json() as Promise<T>;
}

export const vacanciesApi = {
  list: (q: ListVacanciesQuery = {}) =>
    get<ListVacanciesResponse>(`/vacancies${buildQs(q)}`),
};
```

### Boundaries: `loading.tsx`, `error.tsx`

Use Next.js conventions instead of a hand-rolled `<ErrorBoundary>`. Place `loading.tsx` (streamed fallback) and `error.tsx` (`"use client"`, receives `{ error, reset }`) next to `page.tsx`. A custom boundary is only needed for sub-tree errors inside a single page.

### Client-side fetching is the exception

Most pages should be Server Components. Reach for `useEffect` / SWR / TanStack Query only for user-specific data that changes frequently (e.g. search-as-you-type) or a single client-only widget on an otherwise static page. For URL-driven filters, prefer `searchParams` on a Server Component over a client `useEffect` loop.

---

## State

Pick the smallest tool. In order of preference:

| Need                              | Use                                      |
|-----------------------------------|------------------------------------------|
| Component-local UI flag           | `useState`                               |
| Filter / pagination / sort        | URL `searchParams` on a Server Component |
| Tree-local cross-component state  | `React.createContext` + provider         |
| Anything bigger                   | Re-evaluate — usually means a new page   |

No Redux. No Zustand. If something seems to need a store, a Server Component re-render with new `searchParams` is almost always cleaner.

### Context for tree-local state

```tsx
const FormCtx = createContext<FormCtxValue | null>(null);

export function useFormContext(): FormCtxValue {
  const v = useContext(FormCtx);
  if (!v) throw new Error("useFormContext must be used inside <FormProvider>");
  return v;
}
```

Always throw on missing provider — silent `null` chains hide bugs.

---

## Forms

Controlled — single source of truth in `useState`, validate on submit, disable the button while in-flight:

```tsx
const [values, setValues] = useState<FormValues>(initial);
const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = useCallback(async (e: FormEvent) => {
  e.preventDefault();
  const v = validate(values);
  if (Object.keys(v).length) { setErrors(v); return; }
  setIsSubmitting(true);
  try { await onSubmit(values); } finally { setIsSubmitting(false); }
}, [values, onSubmit]);
```

For server-mutating forms, prefer Next.js Server Actions (`<form action={action}>`) over a hand-rolled `fetch` — progressive enhancement and revalidation come free.

When a form has 5+ fields, lift `values`/`errors`/`setValue` into a context and write a `<FormField name="…" />` that reads from it.

---

## UI patterns

- **Loading / error / empty.** For Server Component pages: `loading.tsx` + `error.tsx` next to `page.tsx`. For client-only widgets: a one-liner gate (`if (isLoading) return …; if (error) …; if (!items.length) …`).
- **Modal via portal.** `createPortal` to `document.body`, lock `document.body.style.overflow = "hidden"` while open, listen for `Escape` in a `useEffect` whose cleanup removes both. Don't bake click-overlay-to-close into the primitive — leave it to the consumer.
- **Infinite scroll vs pagination.** For investigation pages, use URL-driven `<Pagination />` from `app/(investigation)/_components/` — infinite scroll breaks back-button restoration. Reach for an `IntersectionObserver` ref-callback only when scroll context is essential to the UX (a feed). Don't pull in a library.

---

## Compound components

When pieces share state and are always used together, attach children to the parent (`Tabs.List = TabList; Tabs.Tab = Tab; Tabs.Panel = TabPanel`). YAGNI gate: only reach for this when the alternative would wire 4+ props between parent and children.

---

## Anti-patterns

- Components defined inside other components (re-created every render).
- `any`, or casts to silence TS — see [STYLE.md#typescript](STYLE.md#typescript).
- Inline JSX handlers — see top of this doc.
- Array index as `key`.
- `useEffect` for derived data (compute it in the render body or `useMemo`).
- Reaching for a global store before exhausting `searchParams` + Server Components.
- "Just in case" tier-2 components — start in `_components/`, promote on second consumer.
