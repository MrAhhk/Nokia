import fs from "fs";
import path from "path";

test("the bundled launcher shell does not wait for remote fonts", () => {
  const css = fs.readFileSync(path.join(__dirname, "App.css"), "utf8");
  expect(css).not.toContain("fonts.googleapis.com");
});

test("the keyboard entry does not statically load launcher and router features", () => {
  const source = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
  expect(source).toContain("lazy(");
  expect(source).not.toContain('import NokiaLauncher from');
  expect(source).not.toContain('from "react-router-dom"');
});

test("the app entry does not initialize an unused query client", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  expect(source).not.toContain("@tanstack/react-query");
  expect(source).not.toContain("QueryClientProvider");
});
