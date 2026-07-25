import { breadcrumbJsonLd } from "./breadcrumbs";
import { SITE_URL } from "./site";

describe("breadcrumbJsonLd", () => {
  it("numbers positions from 1 and absolutises every item", () => {
    const ld = breadcrumbJsonLd([
      { name: "Вакансії", path: "/" },
      { name: "Backend", path: "/backend" },
      { name: "Backend Developer", path: "/vacancy/backend-developer-abc" },
    ]);

    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Вакансії", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Backend", item: `${SITE_URL}/backend` },
      {
        "@type": "ListItem",
        position: 3,
        name: "Backend Developer",
        item: `${SITE_URL}/vacancy/backend-developer-abc`,
      },
    ]);
  });

  it("produces a valid, empty list rather than throwing", () => {
    expect(breadcrumbJsonLd([]).itemListElement).toEqual([]);
  });
});
