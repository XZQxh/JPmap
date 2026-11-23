// Keep the official browser SDK local so using the map does not require a CDN.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules/@supabase/supabase-js');
const output = path.join(root, 'assets/vendor');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(source, 'dist/umd/supabase.js'), path.join(output, 'supabase.js'));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(output, 'supabase-LICENSE'));
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(output, 'supabase-version.json'), JSON.stringify({ package: pkg.name, version: pkg.version, license: pkg.license }, null, 2) + '\n');
console.log(`Vendored official ${pkg.name} ${pkg.version}`);
