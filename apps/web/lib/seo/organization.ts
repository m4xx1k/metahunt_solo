import { SITE_NAME, SITE_URL, absoluteUrl } from "./site";

// Emitted on the home page only — Google wants organisation markup on the single
// most representative page, and `logo` is how the brand mark gets associated.
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/brand/icon-512.png"),
    description:
      "Агрегатор українських IT-вакансій: збирає DOU і Djinni в один структурований список, згортає дублі та підбирає вакансії під резюме.",
    areaServed: { "@type": "Country", name: "Ukraine" },
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "uk-UA",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
