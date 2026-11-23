// Package only browser assets for GitHub Pages, leaving local tools and previews out.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '_site');
fs.mkdirSync(output, { recursive: true });
for (const file of [
  'index.html', 'map-style.js', 'map-color-style.js', 'nearby.js',
  'pilgrimage.js', 'weather.js', 'weather-ui.js', 'weather.css', 'place-search.js', 'place-search-ui.js', 'THIRD_PARTY.md'
]) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('GitHub Pages files ready in _site/');

