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

test("key presses do not repaint procedural SVG filters or CSS filters", () => {
  const agedTheme = fs.readFileSync(
    path.join(__dirname, "components/AgedHardwareTheme.css"),
    "utf8",
  );
  const launcherTheme = fs.readFileSync(
    path.join(__dirname, "components/NokiaLauncher.css"),
    "utf8",
  );

  expect(agedTheme).not.toContain("feTurbulence");
  expect(agedTheme).not.toContain("feGaussianBlur");
  expect(agedTheme).not.toContain("mix-blend-mode");
  expect(agedTheme).not.toContain(".lcd-screen:not(.camera-screen)::before");
  expect(agedTheme).not.toContain(".lcd-screen:not(.camera-screen)::after");
  expect(agedTheme).not.toMatch(/:active[\s\S]*?filter:/);
  expect(launcherTheme).not.toMatch(/:active[\s\S]*?filter:/);
});
