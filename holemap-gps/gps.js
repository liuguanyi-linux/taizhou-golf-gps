(async function () {
  const query = new URLSearchParams(window.location.search);
  document.body.classList.toggle('embedded-preview', query.get('embed') === '1');
  const COURSE_ID = query.get('gb') || 'cn0000385';
  const DATA_URL = `../holemap-data/${encodeURIComponent(COURSE_ID)}-codex.json`;
  const DEVICE_ROUTES_URL = `../holemap-data/${encodeURIComponent(COURSE_ID)}-device-routes.json`;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ZH_TEE = { '黑': 'black', '蓝': 'blue', '白': 'white', '红': 'red' };
  const VIRTUAL_SIZE = {
    1: [886, 1775], 2: [1033, 1522], 3: [1089, 1444], 4: [1199, 1312], 5: [1098, 1433], 6: [1003, 1568],
    7: [1293, 1217], 8: [947, 1660], 9: [1222, 1287], 10: [1005, 1565], 11: [1060, 1484], 12: [1078, 1459],
    13: [1050, 1498], 14: [1244, 1265], 15: [1103, 1426], 16: [1551, 1014], 17: [1740, 904], 18: [958, 1641],
  };
  const TEE_ORDER = [
    ['black', '黑 Tee'],
    ['blue', '蓝 Tee'],
    ['white', '白 Tee'],
    ['red', '红 Tee'],
  ];
  const el = (id) => document.getElementById(id);
  const ui = {
    sourceStatus: el('sourceStatus'),
    pageTitle: el('pageTitle'),
    holeNumber: el('holeNumber'),
    holePar: el('holePar'),
    holeDistance: el('holeDistance'),
    holeNav: el('holeNav'),
    mapStage: el('mapStage'),
    mapFrame: el('mapFrame'),
    virtualMap: el('virtualMap'),
    dataMap: el('dataMap'),
    zoneValue: el('zoneValue'),
    zoneBadge: el('zoneBadge'),
    distanceValue: el('distanceValue'),
    distanceLabel: el('distanceLabel'),
    referencePointLabel: el('referencePointLabel'),
    referencePointValue: el('referencePointValue'),
    greenFrontValue: el('greenFrontValue'),
    greenMiddleValue: el('greenMiddleValue'),
    greenBackValue: el('greenBackValue'),
    bunkerValue: el('bunkerValue'),
    waterValue: el('waterValue'),
    progressValue: el('progressValue'),
    accuracyValue: el('accuracyValue'),
    speedValue: el('speedValue'),
    headingValue: el('headingValue'),
    coordinateValue: el('coordinateValue'),
    player: el('playerMarker'),
    accuracy: el('accuracyRing'),
    trail: el('trailLine'),
    anchors: el('teeAnchors'),
    route: el('centerRoute'),
    range: el('routeRange'),
    routeOutput: el('routeOutput'),
    targetSelect: el('targetSelect'),
    play: el('playButton'),
    reset: el('resetButton'),
    gps: el('gpsButton'),
    stopGps: el('stopGpsButton'),
    export: el('exportButton'),
    exportCourse: el('exportCourseButton'),
    vectorToggle: el('vectorToggle'),
    trailToggle: el('trailToggle'),
    anchorToggle: el('anchorToggle'),
    routeToggle: el('routeToggle'),
    routeToggleText: el('routeToggleText'),
    accuracyToggle: el('accuracyToggle'),
  };

  let holesByNumber = new Map();
  let courseData = null;
  let activeNumber = 1;
  let hole;
  let projection;
  let mapper;
  let renderCounts = {};
  let simulationTimer = null;
  let watchId = null;
  let trailPoints = [];
  let virtualCalibration = null;
  let lastPosition = null;
  let referenceTargets = [];

  // 必须先监听再给 iframe 设置 src；缓存较快时否则会漏掉其首个 calibration-ready。
  function handleVirtualMessage(event) {
    const message = event.data;
    if(event.origin!==location.origin)return;
    if(event.source===window.parent&&message?.source==='holemap-parent'&&message.type==='refresh-point-data'&&Array.isArray(message.holes)){
      courseData.holes=message.holes;holesByNumber=new Map(message.holes.map(h=>[Number(h.n),h]));hole=holesByNumber.get(activeNumber)||hole;
      buildReferenceTargets();syncVirtualReferences();if(lastPosition)updatePosition(lastPosition.coord,lastPosition.accuracy,false,{simulation:lastPosition.simulation});return;
    }
    if (message?.source !== 'holemap-hd' || event.source!==ui.virtualMap.contentWindow || Number(message.hole) !== activeNumber) return;
    if (message.type === 'ready') syncVirtualLayers();
    if (message.type === 'calibration-ready') {
      virtualCalibration = fitVirtualCalibration(message.overlays, hole);
      syncVirtualLayers();
      syncVirtualReferences();
      syncVirtualRoute();
      if (lastPosition) postVirtualPosition(lastPosition.coord, lastPosition.accuracy, false);
    }
  }
  window.addEventListener('message', handleVirtualMessage);

  function svgNode(tag, attributes = {}, text = '') {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  }

  function createGpsMapper(activeHole, activeProjection) {
    const centerCoords = HoleGpsCore.teeToGreenLine(activeHole);
    const centerGeoLine = HoleGpsCore.buildMetricLine(centerCoords);
    const cartCoords = HoleGpsCore.cartSimulationRoute(activeHole);
    const hasCartRoute = cartCoords.length >= 2;
    const coords = hasCartRoute ? cartCoords : centerCoords;
    const geoLine = HoleGpsCore.buildMetricLine(coords);
    return {
      coords,
      geoLine,
      centerCoords,
      centerGeoLine,
      hasCartRoute,
      map(coord) {
        return {
          ...activeProjection.map(coord),
          ...HoleGpsCore.projectOnLine(coord, geoLine),
          holeProgress: HoleGpsCore.projectOnLine(coord, centerGeoLine).progress,
        };
      },
    };
  }

  function solve3(matrix, vector) {
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < 3; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 3; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 1e-10) return null;
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      for (let cell = column; cell < 4; cell += 1) rows[column][cell] /= divisor;
      for (let row = 0; row < 3; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let cell = column; cell < 4; cell += 1) rows[row][cell] -= factor * rows[column][cell];
      }
    }
    return rows.map((row) => row[3]);
  }

  function fitVirtualCalibration(payload, activeHole) {
    if (!payload || !activeHole) return null;
    if(activeHole.registration?.controls?.length&&window.HoleRegistration){
      const model=HoleRegistration.fit(activeHole.registration.controls,{checkpoints:activeHole.registration.checkpoints||[]});
      if(!model.valid)return null;
      return {geoToPixel:geo=>HoleRegistration.geoToPixel(model,geo,{allowExtrapolation:true}),pxPerMeter:model.pxPerMeter,model};
    }
    const samples = [];
    Object.entries(payload.tees || {}).forEach(([name, pixel]) => {
      const geo = activeHole.tees?.[ZH_TEE[name]];
      if (geo && pixel) samples.push({ geo, pixel });
    });
    if (activeHole.flag && payload.flag) samples.push({ geo: activeHole.flag, pixel: payload.flag });
    if (samples.length < 3) return null;
    const origin = [
      samples.reduce((sum, item) => sum + item.geo[0], 0) / samples.length,
      samples.reduce((sum, item) => sum + item.geo[1], 0) / samples.length,
    ];
    const kx = 111320 * Math.cos(origin[1] * Math.PI / 180);
    const ky = 110540;
    const sourceRows = samples.map((item) => [(item.geo[0] - origin[0]) * kx, (item.geo[1] - origin[1]) * ky, 1]);
    const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const vectorX = [0, 0, 0];
    const vectorY = [0, 0, 0];
    sourceRows.forEach((row, index) => {
      for (let r = 0; r < 3; r += 1) {
        vectorX[r] += row[r] * samples[index].pixel.x;
        vectorY[r] += row[r] * samples[index].pixel.y;
        for (let c = 0; c < 3; c += 1) normal[r][c] += row[r] * row[c];
      }
    });
    const cx = solve3(normal, vectorX);
    const cy = solve3(normal, vectorY);
    if (!cx || !cy) return null;
    const [a, b, c] = cx;
    const [d, e, f] = cy;
    return {
      // Use the same WGS84 projection as the editor for placed points, GPS,
      // and simulated route positions. Route progress never changes a point's location.
      geoToPixel(geo) {
        const x = (geo[0] - origin[0]) * kx;
        const y = (geo[1] - origin[1]) * ky;
        return { x: a * x + b * y + c, y: d * x + e * y + f };
      },
      pxPerMeter: (Math.hypot(a, d) + Math.hypot(b, e)) / 2,
    };
  }

  function postVirtualPosition(coord, accuracy, appendTrail) {
    if (!virtualCalibration || !ui.virtualMap.contentWindow) return;
    const pixel=virtualCalibration.geoToPixel(coord),size=VIRTUAL_SIZE[activeNumber];
    if(!pixel||!size||pixel.x<0||pixel.y<0||pixel.x>size[0]||pixel.y>size[1]){
      ui.virtualMap.contentWindow.postMessage({source:'holemap-parent',type:'hide-gps-point',hole:activeNumber},location.origin);return;
    }
    ui.virtualMap.contentWindow.postMessage({
      source: 'holemap-parent',
      type: 'show-gps-point',
      hole: activeNumber,
      point: pixel,
      label: lastPosition?.simulation ? '球车位置（模拟）' : '实时 GPS 位置',
      accuracyPx: Math.max(10, Number(accuracy || 5) * virtualCalibration.pxPerMeter),
      appendTrail: Boolean(appendTrail),
    }, '*');
  }

  function syncVirtualLayers() {
    ui.virtualMap.contentWindow?.postMessage({
      source: 'holemap-parent',
      type: 'set-device-layers',
      hole: activeNumber,
      layers: {
        trail: ui.trailToggle.checked,
        anchors: ui.anchorToggle.checked,
        route: ui.routeToggle.checked,
        accuracy: ui.accuracyToggle.checked,
      },
    }, '*');
  }

  function drawAnchors() {
    ui.anchors.replaceChildren();
    TEE_ORDER.forEach(([color, label]) => {
      const coord = hole.tees?.[color];
      if (!coord) return;
      const point = projection.map(coord);
      const group = svgNode('g', {
        class: `anchor ${color}`,
        transform: `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`,
        'data-feature': 'tee',
        'data-color': color,
      });
      group.append(svgNode('circle', { r: 10 }));
      group.append(svgNode('text', { x: 17, y: 7 }, `${label} ${hole.dist?.[color] ?? ''} m`));
      ui.anchors.append(group);
    });

    if (hole.flag) {
      const point = projection.map(hole.flag);
      const flag = svgNode('g', {
        class: 'anchor flag',
        transform: `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`,
        'data-feature': 'flag',
      });
      flag.append(svgNode('line', { x1: 0, y1: -42, x2: 0, y2: 5, class: 'flag-pole' }));
      flag.append(svgNode('path', { d: 'M0 -42 L38 -31 L0 -20 Z', class: 'flag-cloth' }));
      flag.append(svgNode('circle', { r: 9 }));
      flag.append(svgNode('text', { x: 17, y: 7 }, `${activeNumber} 号果岭`));
      ui.anchors.append(flag);
    }

    // The moving player is the only cart marker; do not leave a second cart
    // at its saved simulation start point.
  }

  function buildReferenceTargets() {
    const targets = [];
    const add = (id, name, coordinate, kind) => {
      if (Array.isArray(coordinate) && coordinate.length >= 2) targets.push({ id, name, coordinate, kind });
    };
    add('flag', '果岭旗', hole.flag, 'flag');
    ['front', 'middle', 'back'].forEach((role) => add(`green-${role}`, `果岭${{ front: '前缘', middle: '中心', back: '后缘' }[role]}`, hole.green_targets?.[role], 'green_target'));
    TEE_ORDER.forEach(([color, label]) => add(`tee-${color}`, label, hole.tees?.[color], 'tee'));
    (hole.device_points || []).forEach((item, index) => add(`point-${item.id || index}`, item.name || `GPS 参考点 ${index + 1}`, item.coordinate, item.kind || 'reference'));
    if(window.HolePointWorkspace){
      targets.length=0;
      HolePointWorkspace.buildCatalog(courseData,{courseId:COURSE_ID}).points.filter(p=>p.type!=='cart-position')
        .sort((a,b)=>(a.hole===activeNumber?-1:0)-(b.hole===activeNumber?-1:0))
        .forEach(p=>add(p.id,'第 '+p.hole+' 洞 · '+p.name,p.coordinate,p.kind));
    }
    const current = ui.targetSelect.value;
    referenceTargets = targets;
    ui.targetSelect.replaceChildren();
    targets.forEach((target) => {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.name;
      ui.targetSelect.append(option);
    });
    if (targets.some((target) => target.id === current)) ui.targetSelect.value = current;
    else ui.targetSelect.value=targets.find(t=>t.id===COURSE_ID+'/hole/'+activeNumber+'/green/flag')?.id||targets[0]?.id||'';
  }

  function selectedReferenceTarget() {
    return referenceTargets.find((target) => target.id === ui.targetSelect.value) || referenceTargets[0] || null;
  }

  function syncVirtualReferences() {
    if (!virtualCalibration || !ui.virtualMap.contentWindow) return;
    const size=VIRTUAL_SIZE[activeNumber];
    const points = (hole.device_points||[]).filter(p=>HolePointWorkspace.coordinate(p.coordinate)).flatMap(p=>{
      const point=virtualCalibration.geoToPixel(p.coordinate);
      return point&&size&&point.x>=0&&point.y>=0&&point.x<=size[0]&&point.y<=size[1]?[{id:p.id,name:p.name,kind:p.kind,point}]:[];
    });
    ui.virtualMap.contentWindow.postMessage({ source: 'holemap-parent', type: 'set-device-references', hole: activeNumber, points }, '*');
  }

  function syncVirtualRoute() {
    if (!virtualCalibration || !ui.virtualMap.contentWindow) return;
    const points = (hole.cart_route || [])
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => virtualCalibration.geoToPixel(coord));
    ui.virtualMap.contentWindow.postMessage({ source: 'holemap-parent', type: 'set-device-route', hole: activeNumber, points }, '*');
  }

  function fitFrame() {
    if (!projection) return;
    const availableWidth = Math.max(1, ui.mapStage.clientWidth - 32);
    const availableHeight = Math.max(1, ui.mapStage.clientHeight - 32);
    const size = VIRTUAL_SIZE[activeNumber] || [projection.width, projection.height];
    const ratio = ui.vectorToggle.checked ? projection.width / projection.height : size[0] / size[1];
    let width = availableWidth;
    let height = width / ratio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }
    ui.mapFrame.style.width = `${Math.round(width)}px`;
    ui.mapFrame.style.height = `${Math.round(height)}px`;
  }

  function interpolateLine(progress) {
    const line = mapper.geoLine;
    const target = Math.max(0, Math.min(1, progress)) * line.total;
    let index = 1;
    while (index < line.cumulative.length && line.cumulative[index] < target) index += 1;
    index = Math.min(index, mapper.coords.length - 1);
    const span = line.cumulative[index] - line.cumulative[index - 1] || 1;
    const t = (target - line.cumulative[index - 1]) / span;
    const a = mapper.coords[index - 1];
    const b = mapper.coords[index];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function metricText(value) {
    return Number.isFinite(value) ? `${Math.round(value)} m` : '-';
  }

  function updatePosition(coord, accuracy, appendTrail, telemetry = {}) {
    if (!mapper || !hole) return;
    const mapped = mapper.map(coord);
    const metrics = HoleGpsCore.deviceMetrics(coord, hole);
    const zone = metrics.zone;
    const routeMetrics = metrics.cart_route;
    const remaining = routeMetrics?.remaining_to_flag ?? metrics.flag;
    const referenceTarget = selectedReferenceTarget();
    const referenceDistance = referenceTarget ? HolePointWorkspace.distanceMeters(coord, referenceTarget.coordinate) : null;
    ui.player.setAttribute('transform', `translate(${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)})`);
    ui.accuracy.setAttribute('transform', `translate(${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)})`);
    const ringRadius = Math.max(14, Math.min(120, (accuracy || 5) * projection.scale));
    ui.accuracy.querySelector('circle').setAttribute('r', ringRadius.toFixed(1));
    ui.zoneValue.textContent = zone;
    ui.zoneBadge.textContent = `${zone} | ${routeMetrics ? '路线剩余' : '距旗杆'} ${Math.round(remaining)} m`;
    ui.distanceLabel.textContent = routeMetrics ? '沿球车路线到果岭' : '直线距果岭旗';
    ui.distanceValue.textContent = metricText(remaining);
    ui.referencePointLabel.textContent = referenceTarget?.id === 'flag' ? '直线距果岭旗' : (referenceTarget ? `距${referenceTarget.name}` : '距指定点');
    ui.referencePointValue.textContent = metricText(referenceDistance);
    ui.greenFrontValue.textContent = metricText(metrics.green_front);
    ui.greenMiddleValue.textContent = metricText(metrics.green_middle);
    ui.greenBackValue.textContent = metricText(metrics.green_back);
    ui.bunkerValue.textContent = metricText(metrics.bunker_nearest);
    ui.waterValue.textContent = metricText(metrics.water_nearest);
    ui.progressValue.textContent = `${Math.round(mapped.progress * 100)}%`;
    ui.accuracyValue.textContent = telemetry.simulation || accuracy == null ? '模拟' : `±${Math.round(accuracy)} m`;
    ui.speedValue.textContent = Number.isFinite(telemetry.speed) ? `${Math.round(telemetry.speed * 3.6)} km/h` : '0 km/h';
    ui.headingValue.textContent = Number.isFinite(telemetry.heading) ? `${Math.round(telemetry.heading)}°` : '-';
    ui.coordinateValue.textContent = `${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}`;
    ui.range.value = Math.round(mapped.progress * 1000);
    ui.routeOutput.value = `${Math.round(mapped.progress * 100)}%`;
    lastPosition = { coord, accuracy, simulation: Boolean(telemetry.simulation) };
    postVirtualPosition(coord, accuracy, appendTrail);
    if (appendTrail) {
      trailPoints.push([mapped.x, mapped.y]);
      if (trailPoints.length > 360) trailPoints.shift();
      ui.trail.setAttribute('points', trailPoints.map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' '));
    }
  }

  function setSimProgress(value, appendTrail) {
    if (!mapper?.hasCartRoute) return;
    updatePosition(interpolateLine(Number(value) / 1000), null, appendTrail, { simulation: true });
  }

  function stopSimulation() {
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = null;
    ui.play.textContent = '▶ 模拟球车行驶';
  }

  function stopGps() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    ui.gps.disabled = false;
    ui.stopGps.disabled = true;
  }

  function resetTrack() {
    trailPoints = [];
    ui.trail.setAttribute('points', '');
    ui.range.value = 0;
    ui.routeOutput.value = '0%';
    ui.virtualMap.contentWindow?.postMessage({ source: 'holemap-parent', type: 'clear-gps-trail', hole: activeNumber }, '*');
  }

  function closeRing(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  }

  function feature(geometry, type, properties = {}) {
    return {
      type: 'Feature',
      geometry,
      properties: { feature_type: type, hole: activeNumber, ...properties },
    };
  }

  function polygonFeatures(value, type) {
    return HoleGpsCore.rings(value).map((ring, index) => feature(
      { type: 'Polygon', coordinates: [closeRing(ring)] },
      type,
      { index },
    ));
  }

  function lineFeatures(value, type) {
    return (value || [])
      .filter((line) => Array.isArray(line) && line.length >= 2 && typeof line[0]?.[0] === 'number')
      .map((line, index) => feature({ type: 'LineString', coordinates: line }, type, { index }));
  }

  function downloadJson(collection, filename) {
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportGeoJson() {
    const holeId = String(activeNumber).padStart(2, '0');
    downloadJson(HoleGeoJson.collectionForHole(hole, COURSE_ID, courseData?.name || ''), `${COURSE_ID}-hole-${holeId}.geojson`);
  }

  function exportCourseGeoJson() {
    downloadJson(HoleGeoJson.collectionForCourse(courseData, COURSE_ID), `${COURSE_ID}-18-holes-device.geojson`);
  }

  function restoreDraft(item) {
    try {
      const raw = localStorage.getItem(`golfmap.gps-draft.${COURSE_ID}.hole-${item.n}`);
      const saved = JSON.parse(raw || 'null');
      if (saved?.hole_data) Object.assign(item, saved.hole_data);
      else if (saved) {
        if (saved.tees) item.tees = { ...(item.tees || {}), ...saved.tees };
        if (saved.flag) item.flag = saved.flag;
      }
    } catch (_) { }
    item.green_targets = HoleGeoJson.derivedGreenTargets(item);
    return item;
  }

  function buildHoleNav() {
    ui.holeNav.replaceChildren();
    for (let number = 1; number <= 18; number += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = number;
      button.dataset.hole = number;
      button.setAttribute('aria-label', `查看第 ${number} 洞`);
      button.addEventListener('click', () => loadHole(number, true));
      ui.holeNav.append(button);
    }
  }

  function loadHole(number, updateUrl = false, preserveGps = false) {
    const nextHole = holesByNumber.get(number);
    if (!nextHole) return;
    stopSimulation();
    if (!preserveGps) stopGps();
    resetTrack();
    activeNumber = number;
    hole = nextHole;
    virtualCalibration = null;
    lastPosition = null;
    ui.virtualMap.src = `../holemap-hd/index.html?hole=${number}&mode=concept&labels=on&embed=1&device=1&rev=device-scene-v5`;

    const rendered = HoleVectorRenderer.render(ui.dataMap, hole);
    projection = rendered.projection;
    renderCounts = rendered.counts;
    mapper = createGpsMapper(hole, projection);
    ui.route.setAttribute('d', HoleVectorRenderer.pathForRing(mapper.coords, projection, false));
    drawAnchors();
    buildReferenceTargets();

    const holeId = String(number).padStart(2, '0');
    ui.pageTitle.textContent = `第 ${number} 洞 球车 GPS`;
    ui.holeNumber.textContent = holeId;
    ui.holePar.textContent = `PAR ${hole.par}`;
    ui.holeDistance.textContent = `黑 Tee ${hole.dist.black} m`;
    ui.export.textContent = `下载 ${number} 号洞 GeoJSON`;
    const featureTotal = HoleGeoJson.holeFeatures(hole, COURSE_ID).length;
    const routeReview = hole.cart_route_meta?.reviewed === true ? '已复核' : '待人工复核';
    ui.sourceStatus.textContent = mapper.hasCartRoute
      ? `第 ${number} 洞 | 高清虚拟场景 | ${featureTotal} 个设备要素 | ${Math.round(mapper.geoLine.total)} m 球车路线 · ${routeReview}`
      : `第 ${number} 洞 | 高清虚拟场景 | ${featureTotal} 个设备要素 | 尚未录入完整球车路线`;
    ui.sourceStatus.style.color = '';
    ui.holeNav.querySelectorAll('button').forEach((button) => {
      const active = Number(button.dataset.hole) === number;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    fitFrame();
    ui.play.disabled = !mapper.hasCartRoute;
    ui.range.disabled = !mapper.hasCartRoute;
    ui.routeToggleText.textContent = mapper.hasCartRoute ? '球车行驶路线' : '球洞中线（仅参考）';
    if (Array.isArray(hole.cart_position) && hole.cart_position.length >= 2) updatePosition(hole.cart_position, 0, false, { simulation: true });
    else if (mapper.hasCartRoute) setSimProgress(0, false);
    else updatePosition(hole.tees.black, null, false, { simulation: true });
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('hole', number);
      window.history.replaceState({}, '', url);
    }
  }

  try {
    const [response, routeResponse] = await Promise.all([
      fetch(DATA_URL, { cache: 'no-store' }),
      fetch(DEVICE_ROUTES_URL, { cache: 'no-store' }),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const routeData = routeResponse.ok ? await routeResponse.json() : { holes: [] };
    const deviceRoutes = new Map((routeData.holes || []).map((item) => [Number(item.n), item]));
    courseData = data;
    courseData.holes = data.holes.map((item) => restoreDraft(Object.assign(item, deviceRoutes.get(Number(item.n)) || {})));
    holesByNumber = new Map(courseData.holes.map((item) => [Number(item.n), item]));
    const missing = Array.from({ length: 18 }, (_, index) => index + 1)
      .filter((number) => !holesByNumber.has(number));
    if (missing.length) throw new Error(`缺少球洞数据：${missing.join('、')}`);
    buildHoleNav();
    const requested = Number(query.get('hole'));
    loadHole(requested >= 1 && requested <= 18 ? requested : 1);
  } catch (error) {
    ui.sourceStatus.textContent = `数据加载失败：${error.message}`;
    ui.sourceStatus.style.color = '#ff9a91';
    return;
  }

  ui.play.addEventListener('click', () => {
    if (!mapper?.hasCartRoute) return;
    if (simulationTimer) {
      stopSimulation();
      return;
    }
    stopGps();
    ui.play.textContent = 'Ⅱ 暂停模拟';
    simulationTimer = setInterval(() => {
      const next = Math.min(1000, Number(ui.range.value) + 4);
      ui.range.value = next;
      setSimProgress(next, true);
      if (next === 1000) stopSimulation();
    }, 55);
  });
  ui.reset.addEventListener('click', () => {
    stopSimulation();
    stopGps();
    resetTrack();
    setSimProgress(0, false);
  });
  ui.range.addEventListener('input', () => {
    stopSimulation();
    setSimProgress(ui.range.value, true);
  });
  ui.targetSelect.addEventListener('change', () => {
    if (lastPosition) updatePosition(lastPosition.coord, lastPosition.accuracy, false, { simulation: lastPosition.simulation });
  });
  ui.gps.addEventListener('click', () => {
    stopSimulation();
    if (!navigator.geolocation) {
      alert('当前浏览器不支持 GPS 定位');
      return;
    }
    ui.gps.disabled = true;
    ui.stopGps.disabled = false;
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coord = [position.coords.longitude, position.coords.latitude];
        const matched = HoleGpsCore.findHole(coord, courseData.holes, activeNumber);
        if (matched?.hole && matched.hole.n !== activeNumber && (matched.inside || matched.distance < 80)) {
          loadHole(matched.hole.n, true, true);
        }
        updatePosition(coord, position.coords.accuracy, true, {
          speed: position.coords.speed,
          heading: position.coords.heading,
        });
      },
      (error) => {
        alert(`定位失败：${error.message}`);
        stopGps();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 },
    );
  });
  ui.stopGps.addEventListener('click', stopGps);
  ui.export.addEventListener('click', exportGeoJson);
  ui.exportCourse.addEventListener('click', exportCourseGeoJson);
  ui.vectorToggle.addEventListener('change', () => {
    const vectorMode = ui.vectorToggle.checked;
    ui.dataMap.toggleAttribute('hidden', !vectorMode);
    ui.virtualMap.toggleAttribute('hidden', vectorMode);
    fitFrame();
    if (!vectorMode && lastPosition) postVirtualPosition(lastPosition.coord, lastPosition.accuracy, false);
  });
  ui.trailToggle.addEventListener('change', () => {
    ui.trail.style.display = ui.trailToggle.checked ? '' : 'none';
    syncVirtualLayers();
  });
  ui.anchorToggle.addEventListener('change', () => {
    ui.anchors.style.display = ui.anchorToggle.checked ? '' : 'none';
    syncVirtualLayers();
  });
  ui.routeToggle.addEventListener('change', () => {
    ui.route.style.display = ui.routeToggle.checked ? '' : 'none';
    syncVirtualLayers();
  });
  ui.accuracyToggle.addEventListener('change', () => {
    ui.accuracy.style.display = ui.accuracyToggle.checked ? '' : 'none';
    syncVirtualLayers();
  });
  window.addEventListener('resize', fitFrame);
}());
