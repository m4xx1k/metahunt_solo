import { formatCountUa, pluralizeUa } from "@/lib/format";

// Programmatic pages without real supply are thin/doorway pages, which Google
// penalises. These thresholds are enforced in the routes (notFound) and in the
// sitemap, not left to judgement.
export const ROLE_HUB_MIN_VACANCIES = 3;
export const COMPANY_HUB_MIN_VACANCIES = 3;

export function vacancyCountPhrase(count: number): string {
  return `${formatCountUa(count)} ${pluralizeUa(count, "вакансія", "вакансії", "вакансій")}`;
}

export function roleHubTitle(roleName: string): string {
  return `${roleName} — вакансії в Україні`;
}

export function roleHubDescription(roleName: string, count: number): string {
  return `${vacancyCountPhrase(count)} ${roleName} з DOU і Djinni в одному списку. Дублі згорнуті, є фільтри за грейдом, стеком і форматом роботи.`;
}

export function roleHubIntro(roleName: string, count: number): string {
  return `Усі відкриті вакансії ${roleName} з DOU і Djinni — ${vacancyCountPhrase(count)} в одному списку. Повторні публікації однієї вакансії згорнуті в одну картку, тому той самий оффер не трапиться двічі.`;
}

/** 60 minus " · metahunt", minus "Вакансії в ". */
const COMPANY_NAME_IN_TITLE = 38;
/** Names run to 90 characters in the data ("DAI Global, LLC - U.S. …"). */
const COMPANY_NAME_IN_DESCRIPTION = 60;

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,«-]+$/, "")}…`;
}

export function companyHubTitle(companyName: string): string {
  return `Вакансії в ${clip(companyName, COMPANY_NAME_IN_TITLE)}`;
}

export function companyHubDescription(companyName: string, count: number): string {
  return `${vacancyCountPhrase(count)} в ${clip(companyName, COMPANY_NAME_IN_DESCRIPTION)} з DOU і Djinni в одному списку, без дублів. Грейд, стек і формат роботи — на кожній картці.`;
}

export function companyHubIntro(companyName: string, count: number): string {
  return `${vacancyCountPhrase(count)} в ${companyName}, зібрані з DOU і Djinni. Якщо компанія опублікувала ту саму позицію на кількох сайтах, ти побачиш її один раз.`;
}
