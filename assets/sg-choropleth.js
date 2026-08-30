/* Shared Leaflet choropleth contract for urban boundary metrics.
 * config: { map, geojson, boundaryLevel, metricKey, colorScale, legend, tooltip, spatialStat? }
 */
(function (global) {
  function valueFor(feature, key) {
    var value = feature && feature.properties && feature.properties[key];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function makeRenderer(config) {
    if (!global.L || !config || !config.map || !config.geojson || !config.metricKey) {
      throw new Error('sg-choropleth requires Leaflet, map, geojson and metricKey.');
    }
    var values = config.geojson.features.map(function (feature) { return valueFor(feature, config.metricKey); }).filter(function (value) { return value !== null; });
    var scale = config.colorScale || function (value) {
      var max = Math.max.apply(null, values) || 1;
      return value === null ? '#95a1b2' : value / max > .66 ? '#063f5b' : value / max > .33 ? '#218aa2' : '#a8dbe0';
    };
    var layer = global.L.geoJSON(config.geojson, {
      style: function (feature) {
        var value = valueFor(feature, config.metricKey);
        return { color: '#ffffff', weight: .7, fillColor: scale(value, feature), fillOpacity: value === null ? .2 : .78 };
      },
      onEachFeature: function (feature, featureLayer) {
        var value = valueFor(feature, config.metricKey);
        var text = config.tooltip ? config.tooltip(feature, value) : String(value === null ? '값 없음' : value);
        featureLayer.bindTooltip(text, { sticky: true });
      }
    }).addTo(config.map);
    return { layer: layer, boundaryLevel: config.boundaryLevel, metricKey: config.metricKey, spatialStat: config.spatialStat || null };
  }
  global.SGChoropleth = { create: makeRenderer };
})(window);
