import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HubShell } from "@/app/_components/HubShell";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { vacanciesApi } from "@/lib/api/vacancies";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import {
  ROLE_HUB_MIN_VACANCIES,
  roleHubDescription,
  roleHubIntro,
  roleHubTitle,
} from "@/lib/seo/hub-meta";
import { itemListJsonLd } from "@/lib/seo/item-list";
import { JsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

// Same reasoning as the vacancy page: lib/api reads the session cookie, and a
// cookie read alone keeps a route dynamic and uncacheable. Nothing here is
// user-specific, so force-static plus a revalidate window is what we want.
export const dynamic = "force-static";
export const revalidate = 3600;

const LIST_SIZE = 20;
const RELATED_COUNT = 8;

type PageParams = { slug: string };

async function loadRole(slug: string): Promise<NodeFacet | null> {
  const roles = await facetsApi
    .roles()
    .then((r) => r.roles)
    .catch((): NodeFacet[] => []);
  const role = roles.find((r) => r.id === slug) ?? null;
  // The threshold is the anti-thin-content guard: a landing with two openings on
  // it is a doorway page, and Google treats a pile of them as a quality problem.
  return role && role.count >= ROLE_HUB_MIN_VACANCIES ? role : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const role = await loadRole(slug);
  if (!role) return {};

  return pageMetadata({
    title: roleHubTitle(role.name),
    description: roleHubDescription(role.name, role.count),
    path: `/role/${slug}`,
  });
}

export default async function RoleHubPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const role = await loadRole(slug);
  if (!role) notFound();

  const [list, roles] = await Promise.all([
    vacanciesApi
      .list({ roleIds: [slug], page: 1, pageSize: LIST_SIZE })
      .catch(() => ({ items: [], total: 0, page: 1, pageSize: LIST_SIZE })),
    facetsApi
      .roles()
      .then((r) => r.roles)
      .catch((): NodeFacet[] => []),
  ]);

  // A landing that renders nothing is worse than a 404: it is a thin page that
  // asks to be indexed. The facet count is all-time; the list can still be empty.
  if (list.items.length === 0) notFound();

  const related = roles
    .filter((r) => r.id !== slug && r.count >= ROLE_HUB_MIN_VACANCIES)
    .slice(0, RELATED_COUNT)
    .map((r) => ({ label: r.name, href: `/role/${r.id}` }));

  return (
    <>
      <JsonLd data={itemListJsonLd(list.items)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Вакансії", path: "/" },
          { name: role.name, path: `/role/${slug}` },
        ])}
      />
      <HubShell
        eyebrow="DOU + DJINNI"
        heading={roleHubTitle(role.name)}
        intro={roleHubIntro(role.name, role.count)}
        vacancies={list.items}
        browseHref={`/?roles=${slug}`}
        browseLabel="Відкрити у фіді з фільтрами"
        related={related}
      />
    </>
  );
}
