// Serve the allowlisted prototype files on the local network; no dependencies required.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const publicFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/map-style.js': ['map-style.js', 'text/javascript; charset=utf-8'],
    '/assets/google-maps.png': ['assets/google-maps.png', 'image/png'],
    '/assets/airbnb.ico': ['assets/airbnb.ico', 'image/x-icon'],
    '/assets/ctrip.ico': ['assets/ctrip.ico', 'image/x-icon'] };
  publicFiles['/nearby.js'] = ['nearby.js', 'text/javascript; charset=utf-8'];
  publicFiles['/pilgrimage.js'] = ['pilgrimage.js', 'text/javascript; charset=utf-8'];
  publicFiles['/weather.js'] = ['weather.js', 'text/javascript; charset=utf-8'];
  publicFiles['/weather-ui.js'] = ['weather-ui.js', 'text/javascript; charset=utf-8'];
  publicFiles['/weather.css'] = ['weather.css', 'text/css; charset=utf-8'];
  publicFiles['/place-search.js'] = ['place-search.js', 'text/javascript; charset=utf-8'];
  publicFiles['/place-search-ui.js'] = ['place-search-ui.js', 'text/javascript; charset=utf-8'];
  publicFiles['/app-links.js'] = ['app-links.js', 'text/javascript; charset=utf-8'];
  for (const [file, type] of [['agoda.png', 'image/png'], ['klook.png', 'image/png'], ['hopegoo.jpg', 'image/jpeg'], ['tabelog.ico', 'image/x-icon'], ['dining.svg', 'image/svg+xml']]) {
    publicFiles['/assets/' + file] = ['assets/' + file, type];
  }
  publicFiles['/map-color-style.js'] = ['map-color-style.js', 'text/javascript; charset=utf-8'];
  publicFiles['/assets/maimai.ico'] = ['assets/maimai.ico', 'image/x-icon'];
  for (const file of ['japan-atmosphere.webp', 'pilgrimage-characters.webp']) {
    publicFiles['/assets/' + file] = ['assets/' + file, 'image/webp'];
  }
  const file = publicFiles[pathname];
  if (!file || !Object.hasOwn(publicFiles, pathname)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => {
    if (error) { res.writeHead(500); res.end('Could not read index.html'); return; }
    res.writeHead(200, { 'Content-Type': file[1], 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const port = Number(process.env.JPMAP_PORT) || 8765;
const host = process.env.JPMAP_HOST || '0.0.0.0';
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Restart the existing map server to use the updated settings.` : error.message); process.exitCode = 1; });
server.listen(port, host, () => {
  console.log(`Japan travel map: http://127.0.0.1:${port}`);
  if (host === '0.0.0.0') {
    const addresses = new Set(Object.values(os.networkInterfaces()).flat().filter(address => address && address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)).map(address => address.address));
    for (const address of addresses) console.log(`LAN / phone: http://${address}:${port}`);
  }
  console.log(`Listening on ${host}:${port}\nKeep this window open. Press Ctrl+C to stop.`);
});
module.exports = server;
