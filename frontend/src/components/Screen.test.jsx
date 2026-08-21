import { renderToStaticMarkup } from "react-dom/server";
import Screen from "./Screen";

const renderHome = (deviceStatus) => renderToStaticMarkup(
  <Screen
    currentView="home"
    menuItems={[]}
    selectedIndex={0}
    selectedHomeTarget="search"
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
});
