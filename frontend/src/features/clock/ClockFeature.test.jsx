import { renderToStaticMarkup } from "react-dom/server";
import ClockFeature from "./ClockFeature";

test("renders a finite touch-accessible clock with timer and stopwatch modes", () => {
  const markup = renderToStaticMarkup(<ClockFeature onExit={() => {}} />);

  expect(markup).toContain('data-testid="screen-clock"');
  expect(markup).toContain("Clock");
  expect(markup).toContain("Timer");
  expect(markup).toContain("Stopwatch");
  expect(markup).toContain("Back");
});
