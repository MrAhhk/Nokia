const fs = require("fs");
const path = require("path");

test("the audio engine has no module-level catalogue preload", () => {
  const source = fs.readFileSync(path.join(__dirname, "nokiaAudioEngine.js"), "utf8");
  expect(source).not.toMatch(/setTimeout\(\(\) => \{\s*preloadAllSounds\(\)/);
});
