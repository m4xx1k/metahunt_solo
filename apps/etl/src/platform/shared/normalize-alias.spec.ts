import { normalizeAliasName } from "./normalize-alias";

describe("normalizeAliasName", () => {
  it("collapses separator variants to one key", () => {
    expect(normalizeAliasName("REST Assured")).toBe("restassured");
    expect(normalizeAliasName("rest-assured")).toBe("restassured");
    expect(normalizeAliasName("RestAssured")).toBe("restassured");
    expect(normalizeAliasName("MS-SQL")).toBe("mssql");
    expect(normalizeAliasName("Node.js")).toBe("nodejs");
    expect(normalizeAliasName("TCP/IP")).toBe("tcpip");
  });

  it("keeps meaningful symbols so close names stay distinct", () => {
    expect(normalizeAliasName("C")).toBe("c");
    expect(normalizeAliasName("C++")).toBe("c++");
    expect(normalizeAliasName("C#")).toBe("c#");
  });

  it("keeps unicode letters (Cyrillic names don't collapse to empty)", () => {
    expect(normalizeAliasName("Тестування ПЗ")).toBe("тестуванняпз");
  });
});
