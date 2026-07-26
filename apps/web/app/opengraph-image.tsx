import { aggregatesApi } from "@/lib/api/aggregates";
import { formatCountUa } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image() {
  // Deadline like the sitemap's (#131): a slow-but-connecting API hangs past
  // the 60s export cap and fails the whole build — .catch can't rescue a hang.
  const total = await aggregatesApi
    .get({ signal: AbortSignal.timeout(5_000) })
    .then((a) => a.total)
    .catch(() => null);

  return ogImage({
    eyebrow: "Український IT-ринок",
    title: "Вакансії з DOU і Djinni в одному списку",
    facts: [
      total ? `${formatCountUa(total)} вакансій` : null,
      "Дублі згорнуті",
      "Підбір під резюме",
    ],
  });
}
