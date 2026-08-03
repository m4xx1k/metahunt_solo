import type { TrackDto } from "@/lib/api/tracks";
import { formatCountUa, pluralizeUa } from "@/lib/format";

// The feed catch-all serves the index plus ~40 track slugs off one file. Without
// per-track copy every one of them shipped the same title and description, so
// they competed with each other for the same query instead of ranking.

type TrackCopy = Pick<TrackDto, "label" | "count">;

/** "2 463 вакансії Backend" — the label stays indeclinable, the one phrasing that
 *  survives every label we have (Backend, Data & AI, C#, Node.js, AWS). */
export function trackVacancyPhrase(count: number, label: string): string {
  const noun = pluralizeUa(count, "вакансія", "вакансії", "вакансій");
  return `${formatCountUa(count)} ${noun} ${label}`;
}

/** Serves as both `<title>` and `<h1>`: they should agree, and neither carries
 *  the live count — a title that changes every ingest is a title Google distrusts. */
export function trackTitle(label: string): string {
  return `Вакансії ${label} в Україні`;
}

export function trackDescription(track: TrackCopy): string {
  return `${trackVacancyPhrase(track.count, track.label)} з DOU і Djinni в одному списку. Дублі згорнуті, є фільтри за грейдом, стеком і форматом роботи.`;
}

/** Visible intro on track pages, so the page carries prose of its own and not
 *  just a vacancy list that looks like every other track's. */
export function trackIntro(track: TrackCopy): string {
  return `${trackVacancyPhrase(track.count, track.label)} зібрані з DOU і Djinni в один список. Повторні публікації однієї вакансії згорнуті в одну картку, тому ти не переглядаєш те саме двічі. Фільтруй за грейдом, стеком, англійською та форматом роботи — або завантаж резюме, щоб побачити тільки те, що підходить під твій досвід.`;
}

export const FEED_INDEX_TITLE = "[metahunt] — пошук роботи в IT без зайвого шуму";
export const FEED_INDEX_DESCRIPTION =
  "Твій job search OS для українського IT: вакансії з DOU і Djinni в одному місці, без дублів, з радаром нових ролей і добірками в Telegram.";
export const FEED_INDEX_HEADING = "Пошук роботи в IT — в одному місці";
