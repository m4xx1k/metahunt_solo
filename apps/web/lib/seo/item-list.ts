import type { VacancyDto } from "@/lib/api/vacancies";

import { absoluteUrl } from "./site";
import { vacancyPath } from "./vacancy-url";

// Tells Google the page is a list of specific things and where each one lives —
// which is also a second declared crawl path to every vacancy on it, beyond the
// anchors themselves.
export function itemListJsonLd(vacancies: VacancyDto[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: vacancies.length,
    itemListElement: vacancies.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: v.role?.name ?? v.title,
      url: absoluteUrl(vacancyPath({ id: v.id, roleName: v.role?.name, title: v.title })),
    })),
  };
}
