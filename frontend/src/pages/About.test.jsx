import { renderToStaticMarkup } from "react-dom/server";
import About from "./About";

test("publishes the North Star and meaning of core functions", () => {
  const markup = renderToStaticMarkup(<About />);
  expect(markup).toContain("Modern capability without modern-phone addiction");
  expect(markup).toContain("What the functions represent");
  expect(markup).toContain("The built-in camera");
  expect(markup).toContain("Privacy and permissions");
});
