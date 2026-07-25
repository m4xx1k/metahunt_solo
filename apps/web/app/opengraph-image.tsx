import { aggregatesApi } from "@/lib/api/aggregates";
import { formatCountUa } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image() {
  const total = await aggregatesApi
    .get()
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
