import { passesTechGate } from "./vacancy-filter";

describe("passesTechGate", () => {
  describe("title whitelist", () => {
    it.each([
      "Senior Backend Developer",
      "Python Engineer",
      "DevOps / SRE",
      "Frontend (React) Developer",
      "QA Automation Engineer",
      "Розробник Java",
      "Data Engineer",
      "Embedded Firmware Engineer",
      "Розробник Python", // Cyrillic whitelist — was dead code (bug 1)
      "Senior Backend Engineer",
    ])("accepts %p", (title) => {
      const r = passesTechGate({ title });
      expect(r.pass).toBe(true);
      expect(r.stage).toBe("whitelist");
    });
  });

  describe("title blacklist", () => {
    it.each([
      "Senior Recruiter",
      "Sales Account Manager",
      "Product Manager",
      "UI/UX Designer",
      "Mechanical Engineer",
      "HR Business Partner",
      "Customer Success Manager",
      "Бухгалтер", // Cyrillic blacklist — was dead code (bug 1)
      "Графічний дизайнер",
      "Media Buying Team Lead", // the leak (bug 2): blacklist beats whitelist
    ])("rejects %p", (title) => {
      const r = passesTechGate({ title });
      expect(r.pass).toBe(false);
      expect(r.stage).toBe("blacklist");
    });
  });

  describe("unknown rejected (strict)", () => {
    // Non-tech roles with no blacklist stem land here — the review-candidate
    // bucket that grows the vocab from logs (e.g. "Marketing Manager").
    it.each(["Barista", "Cleaner", "Random Job", "LLM Researcher", "Marketing Manager"])(
      "rejects %p as unknown_block",
      (title) => {
        const r = passesTechGate({ title });
        expect(r.pass).toBe(false);
        expect(r.stage).toBe("unknown_block");
      },
    );
  });

  describe("blacklist scoped to role part (company name in tail ignored)", () => {
    it.each([
      "Backend Engineer в NDA Recruitment, Київ", // "recruitment" is the employer
      "Senior Unity Developer в Конструкторське бюро «Логіка», Київ", // "конструктор" is the employer
      "Middle Front-End Developer в Growe Talents, Варшава", // "talents" is the employer
    ])("accepts %p (blacklist term only in employer tail)", (title) => {
      const r = passesTechGate({ title });
      expect(r.pass).toBe(true);
      expect(r.stage).toBe("whitelist");
    });

    it("still blocks when the blacklist term is in the role itself", () => {
      // mechanical "конструктор" role (out of scope) — not an employer name
      expect(passesTechGate({ title: "Інженер-конструктор / CAD Engineer" })).toEqual({
        pass: false,
        stage: "blacklist",
      });
      expect(passesTechGate({ title: "Recruitment Team Lead в bodo" })).toEqual({
        pass: false,
        stage: "blacklist",
      });
    });
  });

  describe("blacklist scoped to role head (parenthetical skills ignored)", () => {
    it.each([
      "QA Engineer (Siebel CRM) в Bank Pivdenny, Київ", // CRM is the tested system
      "Manual QA Engineer (Web, CRM)",
    ])("accepts %p (blacklist term only in parenthetical skill list)", (title) => {
      const r = passesTechGate({ title });
      expect(r.pass).toBe(true);
      expect(r.stage).toBe("whitelist");
    });

    it.each([
      "CRM Team Lead", // CRM is the role function
      "CRM and Retention Team Lead",
      "Team Lead of Media Buying (Gambling)", // junk function in the head
      "Business Development Team Lead (iGaming, Media Buying)", // bizdev, not dev
    ])("still rejects %p (blacklist term in the head)", (title) => {
      const r = passesTechGate({ title });
      expect(r.pass).toBe(false);
      expect(r.stage).toBe("blacklist");
    });
  });

  describe("department gate (ATS)", () => {
    it("dept beats title: Growth Engineer in Engineering passes", () => {
      const r = passesTechGate({
        title: "Growth Engineer",
        department: "Engineering",
      });
      expect(r).toEqual({ pass: true, stage: "dept_pass" });
    });

    it("dept beats title: Account Executive in Sales blocks", () => {
      const r = passesTechGate({
        title: "Account Executive",
        department: "Sales",
      });
      expect(r).toEqual({ pass: false, stage: "dept_block" });
    });

    it("unknown dept falls through to title rules", () => {
      const r = passesTechGate({
        title: "Senior Backend Engineer",
        department: "Special Projects",
      });
      expect(r).toEqual({ pass: true, stage: "whitelist" });
    });
  });
});
