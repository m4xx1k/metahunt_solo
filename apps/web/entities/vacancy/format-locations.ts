const LOCATIONS_MAX = 2;

// Backend ships locations as strings like "Kyiv, Ukraine" (BAML splits city
// and country, but the wire contract collapses them). When every location
// shares the same country, render the country once at the end so we don't
// shout "Україна" five times for an all-UA posting.
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

  const renderableItems = sharedCountry
    ? parsed.map((p) => p.city)
    : parsed.map((p) => (p.country ? `${p.city}, ${p.country}` : p.city));

  const head = renderableItems.slice(0, LOCATIONS_MAX).join(" · ");
  const overflow =
    renderableItems.length > LOCATIONS_MAX
      ? ` +${renderableItems.length - LOCATIONS_MAX}`
      : "";
  const suffix = sharedCountry ? `, ${sharedCountry}` : "";
  return `${head}${overflow}${suffix}`;
}
