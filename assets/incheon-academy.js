/* Public aggregate-only layer. No credentials or facility-level records. */
(async function () {
  'use strict';
  const panels = [...document.querySelectorAll('[data-incheon-map]')];
  if (!panels.length) return;
  const labels = {total: '학원 + 교습소', academyCount: '학원', teachingRoomCount: '교습소'};
  try {
    if (!window.d3) throw new Error('map library unavailable');
    const dataResponse = await fetch('/data/academy/incheon.json');
    if (!dataResponse.ok) throw new Error('aggregate unavailable');
    const data = await dataResponse.json();
    if (data.schemaVersion !== 1 || data.districts.length !== 9) throw new Error('invalid aggregate');
    const geoResponse = await fetch(data.boundary.path);
    if (!geoResponse.ok) throw new Error('geometry unavailable');
    const geo = await geoResponse.json();
    const groups = new Map(data.districts.map(group => [group.code, group]));
    if (geo.features.some(f => !groups.has(f.properties.code))) throw new Error('unmapped geometry');
    for (const panel of panels) {
      const canvas = panel.querySelector('[data-map-canvas]');
      const readout = panel.querySelector('[data-map-readout]');
      const select = panel.querySelector('[data-metric]');
      const legend = panel.querySelector('[data-map-legend]');
      const svg = d3.select(canvas).append('svg').attr('viewBox', '0 0 820 540').attr('role', 'group').attr('aria-label', '인천 시설 수 참고 지도. 2013 경계 기반 9개 비교권역');
      const path = d3.geoPath(d3.geoMercator().fitExtent([[12,12],[808,528]], geo));
      const shapes = svg.selectAll('path').data(geo.features).join('path').attr('d', path).attr('tabindex', 0).attr('role', 'button').attr('stroke', '#818fa8').attr('stroke-width', .7);
      const update = () => {
        const metric = select.value;
        if (!Object.hasOwn(labels, metric)) return;
        const maximum = d3.max(data.districts, group => group[metric]);
        const color = d3.scaleQuantize([0, maximum], ['#efedf5','#bcbddc','#9e9ac8','#756bb1','#54278f']);
        const describe = feature => {
          const group = groups.get(feature.properties.code);
          return `${group.name} · ${labels[metric]} ${group[metric].toLocaleString('ko-KR')}개 · 기준 ${data.period}`;
        };
        const show = (_, feature) => { readout.textContent = describe(feature); };
        shapes.attr('fill', feature => color(groups.get(feature.properties.code)[metric]))
          .attr('aria-label', describe).on('pointerenter', show).on('focus', show).on('click', show)
          .on('keydown', (event, feature) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(event, feature); } });
        shapes.selectAll('title').remove();
        shapes.append('title').text(describe);
        legend.replaceChildren();
        color.range().forEach((fill, index, fills) => {
          const [a,b] = color.invertExtent(fill);
          const swatch = document.createElement('i'); swatch.style.background = fill;
          const item = document.createElement('span');
          item.append(swatch, document.createTextNode(`${Math.ceil(a).toLocaleString('ko-KR')}–${(index === fills.length - 1 ? maximum : Math.ceil(b)-1).toLocaleString('ko-KR')}개`));
          legend.append(item);
        });
        readout.textContent = `${labels[metric]} 표시 중 · 영역 선택 또는 Tab 키로 지역 수치를 확인하세요.`;
      };
      select.addEventListener('change', update);
      update();
    }
  } catch (_) {
    panels.forEach(panel => {
      const output = panel.querySelector('[data-map-readout]');
      output.classList.add('error');
      output.textContent = '지도를 불러오지 못했습니다. 시설 집계는 페이지의 정적 표 또는 인천 상세 지도에서 확인할 수 있습니다.';
    });
  }
})();
