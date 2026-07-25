import { ImageResponse } from "next/og";

import { BRAND_ACCENT, BRAND_INK } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// No custom font is loaded on purpose. next/font/google cannot be used inside
// ImageResponse, and the runtime's bundled default already covers Cyrillic — so
// a font binary in the repo would buy nothing and every OG label here is Ukrainian.
type OgInput = {
  /** Small mono label above the headline. */
  eyebrow: string;
  title: string;
  /** Facts under the headline; falsy entries are dropped. */
  facts?: (string | null | undefined)[];
};

export function ogImage({ eyebrow, title, facts = [] }: OgInput) {
  const shown = facts.filter((f): f is string => Boolean(f));
  // The mark is drawn inline rather than fetched: an external image request in an
  // OG route is one more thing that can fail and leave a blank card.
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BRAND_INK,
        // Sharp corners and a hard offset border — the design system sets
        // --radius: 0 and uses solid brutalist shadows.
        borderTop: `16px solid ${BRAND_ACCENT}`,
        padding: "64px 72px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: BRAND_ACCENT,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 46 ? 64 : 82,
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#E6EDF3",
          }}
        >
          {title}
        </div>
        {shown.length > 0 ? (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {shown.map((fact) => (
              <div
                key={fact}
                style={{
                  display: "flex",
                  fontSize: 28,
                  color: "#8B949E",
                  border: "2px solid #3B424F",
                  padding: "8px 18px",
                }}
              >
                {fact}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", width: 44, height: 44, background: BRAND_ACCENT }} />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#E6EDF3" }}>
          metahunt
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8B949E" }}>
          DOU + Djinni · без дублів
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
