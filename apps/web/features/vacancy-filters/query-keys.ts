// The one place the results query key is built. Both the client hook
// (use-results) and the server components that dehydrate the SSR seed import it,
// so a seed can never land under a key the client won't look up (which would
// refetch on mount and lose the SSR benefit).

import type { ListVacanciesQuery } from "@/lib/api/vacancies";

export const coldKey = (query: ListVacanciesQuery) => ["feed", query] as const;
