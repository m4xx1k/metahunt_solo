import { slugifyCompany } from "./company-slug";

describe("slugifyCompany", () => {
  it("slugifies Latin names the way it always did", () => {
    expect(slugifyCompany("N-iX")).toBe("n-ix");
    expect(slugifyCompany("Ajax Systems")).toBe("ajax-systems");
    expect(slugifyCompany("  Sigma Software  ")).toBe("sigma-software");
  });

  it("romanises a Cyrillic-only name instead of producing an empty slug", () => {
    // "ЛУН" produced "" in production, which merged every Cyrillic-only employer
    // into one company row and made the feed report them as having no company.
    expect(slugifyCompany("ЛУН")).toBe("lun");
    expect(slugifyCompany("Нова Пошта")).toBe("nova-poshta");
  });

  it("keeps distinct Cyrillic names distinct", () => {
    const a = slugifyCompany("ЛУН");
    const b = slugifyCompany("Розетка");
    const c = slugifyCompany("Київстар");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("handles mixed scripts", () => {
    expect(slugifyCompany("OTP Bank Україна")).toBe("otp-bank-ukraina");
    expect(slugifyCompany("Кластер IRON")).toBe("klaster-iron");
  });

  it("no longer degrades a name to its digits alone", () => {
    // This used to slugify to "12" — the letters were all dropped.
    expect(slugifyCompany("Азов, 12-та бригада")).toBe("azov-12-ta-bryhada");
  });

  it("never returns an empty slug", () => {
    for (const name of ["", "   ", "!!!", "—", "中文公司"]) {
      expect(slugifyCompany(name)).not.toBe("");
    }
  });

  it("falls back to a deterministic digest when nothing romanises", () => {
    const a = slugifyCompany("中文公司");
    expect(a).toMatch(/^company-[0-9a-f]{8}$/);
    expect(slugifyCompany("中文公司")).toBe(a);
    expect(slugifyCompany("日本会社")).not.toBe(a);
  });

  it("is stable across calls, since it is the resolve-or-create key", () => {
    expect(slugifyCompany("ЛУН")).toBe(slugifyCompany("лун"));
  });
});
