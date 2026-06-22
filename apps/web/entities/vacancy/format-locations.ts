const CITIES_MAX = 3;
const ITEMS_MAX = 2;

// Backend ships locations as strings like "Kyiv, Ukraine" (BAML splits city
// and country, but the wire contract collapses them). When every location
// shares one country we factor it out — "Ukraine (Kyiv, Kharkiv)" — instead of
// repeating it per city. Mixed countries fall back to a capped "City, Country"
// list.
export function formatLocations(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const parsed = locations.map((raw) => {
    const idx = raw.indexOf(",");
    if (idx === -1) return { city: raw.trim(), country: null as string | null };
    return { city: raw.slice(0, idx).trim(), country: raw.slice(idx + 1).trim() };
  });

  const sharedCountry =
    parsed.every((p) => p.country) &&
    new Set(parsed.map((p) => p.country)).size === 1
      ? parsed[0].country
      : null;

  if (sharedCountry) {
    const cities = parsed.map((p) => p.city);
    if (cities.length === 1) return `${cities[0]}, ${sharedCountry}`;
    const head = cities.slice(0, CITIES_MAX).join(", ");
    const overflow =
      cities.length > CITIES_MAX ? `, +${cities.length - CITIES_MAX}` : "";
    return `${sharedCountry} (${head}${overflow})`;
  }

  const items = parsed.map((p) => (p.country ? `${p.city}, ${p.country}` : p.city));
  const head = items.slice(0, ITEMS_MAX).join(" · ");
  const overflow =
    items.length > ITEMS_MAX ? ` +${items.length - ITEMS_MAX}` : "";
  return `${head}${overflow}`;
}
