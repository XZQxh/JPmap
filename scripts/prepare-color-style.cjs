// Rebuild: node scripts/prepare-color-style.cjs <OpenFreeMap Bright JSON>
const fs = require('node:fs');
const path = require('node:path');
const style = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
style.name = 'Japan travel · colorful';
style.layers = style.layers.filter(layer => !/building-top|hatching|railway-service/.test(layer.id));
const localName = ['coalesce', ['get', 'name'], ['get', 'name:nonlatin'], ['get', 'name:latin']];
const poiColor = ['match', ['get', 'class'],
  ['food', 'restaurant', 'cafe', 'bar', 'fast_food', 'ice_cream'], '#c56831',
  ['shop', 'grocery', 'clothing', 'mall', 'supermarket', 'convenience'], '#7966ba',
  ['lodging', 'hotel', 'hostel'], '#aa5b9d',
  ['park', 'garden', 'nature_reserve'], '#4f8d62',
  ['attraction', 'museum', 'monument', 'viewpoint'], '#328aa1', '#5d6770'];
for (const layer of style.layers) {
  if (layer.type === 'symbol' && layer.layout?.['text-field'] && !/shield|airport/.test(layer.id)) layer.layout['text-field'] = localName;
  if (layer.id === 'background') layer.paint['background-color'] = '#f8f9f6';
  if (layer.id === 'water') layer.paint['fill-color'] = '#a9d2f1';
  if (layer.id === 'park') Object.assign(layer.paint, { 'fill-color': '#b2dfbb', 'fill-opacity': 0.85 });
  if (layer.id === 'landcover-grass-park') layer.paint['fill-color'] = '#c1e2bb';
  if (layer.id === 'building') {
    layer.minzoom = 15.5;
    Object.assign(layer.paint, { 'fill-color': '#e9ece7', 'fill-opacity': 0.65 });
  }
  if (/motorway|trunk/.test(layer.id) && layer.type === 'line' && !/casing/.test(layer.id)) layer.paint['line-color'] = '#ffc777';
  if (layer.id === 'highway-primary' || layer.id === 'bridge-primary') layer.paint['line-color'] = '#ffe4a4';
  if (/highway-name-minor|highway-name-path/.test(layer.id)) layer.minzoom = 16;
  if (layer.type === 'line' && /railway/.test(layer.id)) {
    layer.minzoom = Math.max(layer.minzoom || 0, 10);
    layer.paint['line-color'] = /transit/.test(layer.id) ? '#9b7abb' : '#63998c';
    layer.paint['line-width'] = ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2, 18, 3.5];
  }
  if (layer.id === 'railway-transit') layer.filter = ['==', ['get', 'class'], 'transit'];
  if (/^poi_r/.test(layer.id)) {
    layer.layout['text-font'] = ['Noto Sans Regular'];
    layer.paint['text-color'] = poiColor;
    layer.paint['text-halo-width'] = 1.5;
  }
  if (layer.id === 'poi_transit') {
    // Station labels are handled separately so they stay under the rail switch.
    layer.filter = ['==', ['get', 'class'], 'airport'];
  }
}
const stationFilter = ['any',
  ['in', ['get', 'class'], ['literal', ['rail', 'railway', 'railway_station', 'station']]],
  ['in', ['get', 'subclass'], ['literal', ['station', 'halt', 'subway', 'subway_station', 'tram_stop']]]];
style.layers.push({
  id: 'travel-station-dots', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12, filter: stationFilter,
  paint: { 'circle-radius': 3.5, 'circle-color': '#468bc4', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
}, {
  id: 'travel-station-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12, filter: stationFilter,
  layout: { 'text-field': localName, 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, .8], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 },
  paint: { 'text-color': '#347db4', 'text-halo-color': '#fff', 'text-halo-width': 2 }
});
fs.writeFileSync(path.join(__dirname, '..', 'map-color-style.js'),
  '// Adapted from OpenFreeMap Bright; see THIRD_PARTY.md.\nwindow.JP_COLOR_MAP_STYLE = ' + JSON.stringify(style) + ';\n');
