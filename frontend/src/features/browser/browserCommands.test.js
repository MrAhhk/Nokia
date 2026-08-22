import { getBrowserCommand } from "./browserCommands";

describe("browser keypad commands", () => {
  test("maps navigation and exit keys to finite browser actions", () => {
    expect(getBrowserCommand("LEFT")).toBe("back");
    expect(getBrowserCommand("RIGHT")).toBe("forward");
    expect(getBrowserCommand("UP")).toBe("scroll-up");
    expect(getBrowserCommand("DOWN")).toBe("scroll-down");
    expect(getBrowserCommand("SELECT")).toBe("focus-address");
    expect(getBrowserCommand("SEND")).toBe("submit");
    expect(getBrowserCommand("*")).toBeNull();
    expect(getBrowserCommand("END")).toBe("exit");
    expect(getBrowserCommand("#")).toBe("tabs");
    expect(getBrowserCommand("2")).toBeNull();
    expect(getBrowserCommand("4")).toBeNull();
  });
});
