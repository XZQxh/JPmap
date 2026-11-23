// Rebuild from OpenFreeMap's Positron JSON: node scripts/prepare-map-style.cjs input.json
const fs = require('node:fs');
const path = require('node:path');
const style = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
style.name = 'Japan travel · simple transit';
style.layers = style.layers.filter(layer =>
  !['building', 'landuse_residential', 'railway_service', 'railway_service_dashline'].includes(layer.id) &&
  !/shield|highway-name-path|highway-name-minor/.test(layer.id)
);
for (const layer of style.layers) {
  // A single local name is easier to read than stacked Latin + Japanese labels.
  if (layer.type === 'symbol' && layer.layout?.['text-field'] && !layer.id.includes('airport')) {
    layer.layout['text-field'] = ['coalesce', ['get', 'name'], ['get', 'name:nonlatin'], ['get', 'name:latin']];
  }
  if (layer.id === 'highway-name-major') layer.minzoom = 14;
  if (layer.id === 'label_other') layer.minzoom = 14;
  if (layer.id === 'railway_transit') {
    // Include tunnels: the upstream Positron style filters underground transit out.
    layer.filter = ['==', ['get', 'class'], 'transit'];
    layer.minzoom = 10;
    layer.paint = { 'line-color': '#8270b0', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2.5, 18, 4], 'line-opacity': .85 };
  }
  if (layer.id === 'railway_transit_dashline') layer.layout.visibility = 'none';
  if (layer.id === 'railway') {
    layer.paint['line-color'] = '#518b7a';
    layer.paint['line-width'] = ['interpolate', ['linear'], ['zoom'], 8, .8, 14, 2.5, 18, 4];
  }
  if (layer.id === 'railway_dashline') layer.layout.visibility = 'none';
}
const stationFilter = ['any',
  ['in', ['get', 'class'], ['literal', ['railway', 'railway_station', 'station']]],
  ['in', ['get', 'subclass'], ['literal', ['station', 'halt', 'subway', 'subway_station', 'tram_stop']]]
];
style.layers.push({
  id: 'travel-station-dots', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12,
  filter: stationFilter,
  paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-color': '#517768', 'circle-stroke-width': 1.5 }
}, {
  id: 'travel-station-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12,
  filter: stationFilter,
  layout: { 'text-field': ['coalesce', ['get', 'name'], ['get', 'name:nonlatin'], ['get', 'name:latin']],
    'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, .8], 'text-anchor': 'top',
    'text-optional': true, 'text-max-width': 9 },
  paint: { 'text-color': '#34564a', 'text-halo-color': '#fff', 'text-halo-width': 2 }
});
fs.writeFileSync(path.join(__dirname, '..', 'map-style.js'),
  '// Adapted from OpenFreeMap Positron; see THIRD_PARTY.md.\nwindow.JP_MAP_STYLE = ' + JSON.stringify(style) + ';\n');
