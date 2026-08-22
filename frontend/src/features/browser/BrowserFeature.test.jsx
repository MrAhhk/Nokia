import { renderToStaticMarkup } from "react-dom/server";
import BrowserFeature from "./BrowserFeature";

test("renders a full mini-screen surface for the built-in browser", () => {
  const markup = renderToStaticMarkup(
    <BrowserFeature initialUrl="https://www.google.com" onExit={() => {}} />
  );

  expect(markup).toContain('data-testid="screen-browser"');
  expect(markup).toContain('aria-label="Built-in browser surface"');
  expect(markup).not.toContain("iframe");
});
