import type { MetadataRoute } from "next";

import { BRAND_INK, SITE_NAME } from "@/lib/seo/site";

// Icons live in public/brand/ rather than the app/ conventions so their URLs
// carry no build hash — Google requires a favicon URL that stays stable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "metahunt — вакансії з DOU і Djinni в одному місці",
    short_name: SITE_NAME,
    description:
      "Усі українські IT-вакансії з DOU і Djinni в одному структурованому списку, без дублів, з підбором під резюме.",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_INK,
    theme_color: BRAND_INK,
    lang: "uk",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
