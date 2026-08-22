import { resolveBrowserAddress } from "./browserAddress";

describe("browser address resolution", () => {
  test("opens web addresses directly and sends ordinary text to Google search", () => {
    expect(resolveBrowserAddress("https://example.com/path")).toBe("https://example.com/path");
    expect(resolveBrowserAddress("example.com")).toBe("https://example.com");
    expect(resolveBrowserAddress("calm phone design")).toBe(
      "https://www.google.com/search?q=calm%20phone%20design"
    );
  });

  test("rejects dangerous schemes and uses the calm start page for blank input", () => {
    expect(resolveBrowserAddress("javascript:alert(1)")).toBeNull();
    expect(resolveBrowserAddress("file:///sdcard/private.txt")).toBeNull();
    expect(resolveBrowserAddress("   ")).toBe("https://www.google.com");
  });
});
