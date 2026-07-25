import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubShell } from "@/app/_components/HubShell";
import { sitemapApi, type CompanyFacet } from "@/lib/api/sitemap";
import { vacanciesApi } from "@/lib/api/vacancies";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import {
  COMPANY_HUB_MIN_VACANCIES,
  companyHubDescription,
  companyHubIntro,
  companyHubTitle,
} from "@/lib/seo/hub-meta";
import { itemListJsonLd } from "@/lib/seo/item-list";
import { JsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-static";
export const revalidate = 3600;

const LIST_SIZE = 20;
const RELATED_COUNT = 8;

type PageParams = { slug: string };

async function loadCompany(slug: string): Promise<CompanyFacet | null> {
  // An empty slug was a real value in the data until the resolver was fixed, and
  // "/company/" is not a page — guard rather than trusting the input.
  if (!slug.trim()) return null;
  const companies = await sitemapApi
    .companies()
    .then((r) => r.companies)
    .catch((): CompanyFacet[] => []);
  const company = companies.find((c) => c.slug === slug) ?? null;
  return company && company.count >= COMPANY_HUB_MIN_VACANCIES ? company : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) return {};

  return pageMetadata({
    title: companyHubTitle(company.name),
    description: companyHubDescription(company.name, company.count),
    path: `/company/${slug}`,
  });
}

export default async function CompanyHubPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) notFound();

  const [list, companies] = await Promise.all([
    vacanciesApi
      .list({ companySlug: slug, page: 1, pageSize: LIST_SIZE })
      .catch(() => ({ items: [], total: 0, page: 1, pageSize: LIST_SIZE })),
    sitemapApi
      .companies()
      .then((r) => r.companies)
      .catch((): CompanyFacet[] => []),
  ]);

  if (list.items.length === 0) notFound();

  const related = companies
    .filter((c) => c.slug !== slug && c.slug.trim() && c.count >= COMPANY_HUB_MIN_VACANCIES)
    .slice(0, RELATED_COUNT)
    .map((c) => ({ label: c.name, href: `/company/${c.slug}` }));

  return (
    <>
      <JsonLd data={itemListJsonLd(list.items)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Вакансії", path: "/" },
          { name: company.name, path: `/company/${slug}` },
        ])}
      />
      <HubShell
        eyebrow="DOU + DJINNI"
        heading={companyHubTitle(company.name)}
        intro={companyHubIntro(company.name, company.count)}
        vacancies={list.items}
        browseHref="/"
        browseLabel="Дивитись усі вакансії"
        related={related}
      />
    </>
  );
}
