import { vacanciesApi } from "@/lib/api/vacancies";
import { formatSalary } from "@/lib/extracted-vacancy";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";
import { parseVacancyId } from "@/lib/seo/vacancy-url";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 900;

// The share card carries the facts someone decides on: role, employer, pay,
// location. A launch link with no card at all was costing clicks outright.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = parseVacancyId(slug);
  // Same deadline as the root og-image: a hanging fetch must degrade to the
  // generic card, never stall rendering.
  const vacancy = id
    ? await vacanciesApi.byId(id, { signal: AbortSignal.timeout(5_000) }).catch(() => null)
    : null;

  if (!vacancy) {
    return ogImage({ eyebrow: "Вакансія", title: "Вакансії з DOU і Djinni в одному списку" });
  }

  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });

  return ogImage({
    eyebrow: vacancy.company?.name ?? vacancy.source.displayName.trim(),
    title: vacancy.role?.name ?? vacancy.title,
    facts: [
      salary,
      vacancy.locations[0] ?? (vacancy.workFormat === "REMOTE" ? "Віддалено" : null),
      vacancy.duplicateCount && vacancy.duplicateCount > 1
        ? `${vacancy.duplicateCount}× на ${vacancy.duplicateSourceCount ?? 1} джерелах`
        : null,
    ],
  });
}
