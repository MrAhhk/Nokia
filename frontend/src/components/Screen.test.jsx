import { renderToStaticMarkup } from "react-dom/server";
import Screen from "./Screen";

const renderHome = (deviceStatus, selectedHomeTarget = "search") => renderToStaticMarkup(
  <Screen
    currentView="home"
    menuItems={[]}
    selectedIndex={0}
    selectedHomeTarget={selectedHomeTarget}
    currentTime={new Date("2026-08-21T12:00:00")}
    searchActive={false}
    searchQuery=""
    dialActive={false}
    dialNumber=""
    deviceStatus={deviceStatus}
  />
);

describe("home status icons", () => {
  test("uses volume icons for active and muted alarm audio", () => {
    expect(renderHome({ sirenMuted: false })).toContain("lucide-volume-2");
    expect(renderHome({ sirenMuted: true })).toContain("lucide-volume-x");
  });

  test("renders the selected home clock as a button without an inverse fill", () => {
    const markup = renderHome({}, "clock");
    expect(markup).toContain('class="lcd-time is-selected"');
    expect(markup).toContain('data-testid="home-time"');
    expect(markup).not.toContain('class="lcd-time is-selected" style="background');
  });

  test("keeps the browser reachable through Go to without the removed search bar", () => {
    expect(renderHome({})).toContain('aria-label="Open built-in browser"');
    expect(renderHome({})).toContain('Go to');
    expect(renderHome({})).not.toContain('class="lcd-search');
  });

  test("renders the live carrier and date, with a fallback when no network is available", () => {
    expect(renderHome({ carrierName: "MobiFone" })).toContain('aria-label="MobiFone"');
    expect(renderHome({})).toContain('aria-label="MobiFone"');
    expect(renderHome({})).toContain('aria-label="Fri, 21 Aug"');
  });
});
