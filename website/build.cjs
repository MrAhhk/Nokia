const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html',
  'styles.css',
  'script.js',
  'favicon.svg',
  'site.webmanifest',
  'robots.txt'
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of publicFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Built ${publicFiles.length} public files in dist.`);
