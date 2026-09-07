(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  let hole = Math.min(18, Math.max(1, Number(params.get('hole')) || 1));
  let mode = params.get('mode') || 'concept';
  const embedMode = params.get('embed') === '1';
  const editMode = params.get('edit') === '1';
  const deviceMode = params.get('device') === '1';
  document.body.classList.toggle('embed-mode', embedMode);
  document.body.classList.toggle('edit-mode', editMode);
  document.body.classList.toggle('device-mode', deviceMode);
  const availableConcepts = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);

  const nav = document.getElementById('holeNav');
  const stage = document.getElementById('stage');
  const sourceFrame = document.getElementById('sourceFrame');
  const conceptFrame = document.getElementById('conceptFrame');
  const sourceImage = document.getElementById('sourceImage');
  const conceptImage = document.getElementById('conceptImage');
  const conceptCanvas = document.getElementById('conceptCanvas');
  const pending = document.getElementById('pending');
  const annotationOverlay = document.getElementById('annotationOverlay');
  const annotationToggle = document.getElementById('annotationToggle');
  const exportAnnotated = document.getElementById('exportAnnotated');
  const statusCopy = document.getElementById('statusCopy');
  const modeNote = document.getElementById('modeNote');
  const embedHoleTitle = document.getElementById('embedHoleTitle');
  const overlayEditStatus = document.getElementById('overlayEditStatus');
  const resetOverlayPositions = document.getElementById('resetOverlayPositions');
  const saveOverlayPositions = document.getElementById('saveOverlayPositions');
  let embeddedZoom = 1;
  const buttons = {
    source: document.getElementById('sourceMode'),
    concept: document.getElementById('conceptMode'),
    compare: document.getElementById('compareMode')
  };
  let annotationsVisible = params.get('labels') !== 'off';
  let dragState = null;
  let defaultOverlayCalibration = null;
  let gpsMarker = null;
  let gpsTrail = null;
  let gpsTrailPoints = [];
  let deviceReferenceLayer = null;
  let placementMode = null;
  let deviceLayers = { trail: true, anchors: true, route: true, accuracy: true };
  const parentOverlayState = new Map();
  const holeOneOverlay = annotationOverlay.innerHTML;
  const conceptConfig = {
    1: {
      width: 886,
      height: 1775,
      asset: 'assets/hole-01-hd-concept-v1.png',
      deviceRoute: [
        [618, 1570], [606, 1504], [575, 1420], [531, 1340], [478, 1261],
        [418, 1181], [363, 1092], [326, 1003], [301, 910], [286, 817],
        [282, 723], [290, 632], [306, 545], [329, 461], [354, 382],
        [386, 310], [420, 255], [451, 220]
      ]
    },
    2: { width: 1033, height: 1522, asset: 'assets/hole-02-hd-concept-v1.png' },
    3: { width: 1089, height: 1444, asset: 'assets/hole-03-hd-concept-v1.png' },
    4: { width: 1199, height: 1312, asset: 'assets/hole-04-hd-concept-v1.png' },
    5: { width: 1098, height: 1433, asset: 'assets/hole-05-hd-concept-v1.png' },
    6: { width: 1003, height: 1568, asset: 'assets/hole-06-hd-concept-v1.png' },
    7: { width: 1293, height: 1217, asset: 'assets/hole-07-hd-concept-v1.png' },
    8: { width: 947, height: 1660, asset: 'assets/hole-08-hd-concept-v1.png' },
    9: { width: 1222, height: 1287, asset: 'assets/hole-09-hd-concept-v1.png' },
    10: { width: 1005, height: 1565, asset: 'assets/hole-10-hd-concept-v2.png' },
    11: { width: 1060, height: 1484, asset: 'assets/hole-11-hd-concept-v2.png' },
    12: { width: 1078, height: 1459, asset: 'assets/hole-12-hd-concept-v2.png' },
    13: { width: 1050, height: 1498, asset: 'assets/hole-13-hd-concept-v2.png' },
    14: { width: 1244, height: 1265, asset: 'assets/hole-14-hd-concept-v2.png' },
    15: { width: 1103, height: 1426, asset: 'assets/hole-15-hd-concept-v2.png' },
    16: { width: 1551, height: 1014, asset: 'assets/hole-16-hd-concept-v2.png' },
    17: { width: 1740, height: 904, asset: 'assets/hole-17-hd-concept-v2.png' },
    18: { width: 958, height: 1641, asset: 'assets/hole-18-hd-concept-v2.png' }
  };

  // Pixel-reviewed tee-pad centers in native concept-image coordinates.
  // Each entry is [x, y, safe radius]. Keeping these separately from labels
  // lets the QA guard reject a marker that drifts beyond its real tee pad.
  const teePadCalibration = {
    1: [[465, 1165, 22], [522, 1282, 22], [575, 1385, 22], [650, 1591, 22]],
    2: [[438, 952, 25], [369, 1103, 25], [298, 1132, 25], [202, 1166, 25]],
    3: [[360, 814, 24], [327, 939, 24], [352, 1069, 24], [368, 1218, 24]],
    4: [[911, 933, 24], [962, 1032, 24], [985, 1113, 24], [962, 1184, 24]],
    5: [[608, 992, 24], [627, 1101, 24], [679, 1194, 24], [706, 1269, 24]],
    6: [[463, 1245, 22], [389, 1300, 22], [375, 1341, 22], [372, 1370, 22]],
    7: [[969, 215, 22], [1003, 171, 22], [1043, 133, 22], [1062, 82, 22]],
    8: [[237, 1302, 22], [232, 1359, 22], [218, 1433, 22], [226, 1510, 22]],
    9: [[753, 766, 23], [634, 846, 23], [489, 903, 23], [355, 924, 23]],
    10: [[304, 1188, 22], [298, 1252, 22], [342, 1318, 22], [401, 1372, 22]],
    11: [[443, 1208, 22], [426, 1248, 22], [411, 1293, 22], [397, 1333, 22]],
    12: [[369, 614, 22], [367, 692, 22], [371, 745, 22], [370, 795, 22]],
    13: [[683, 1250, 23], [536, 1324, 23], [402, 1327, 23], [279, 1349, 23]],
    14: [[480, 922, 22], [370, 933, 22], [313, 936, 22], [256, 919, 22]],
    15: [[340, 859, 22], [320, 906, 22], [304, 965, 22], [299, 1023, 22]],
    16: [[701, 339, 24], [570, 370, 24], [477, 397, 24], [375, 425, 24]],
    17: [[506, 571, 24], [382, 480, 24], [322, 440, 24], [283, 374, 24]],
    18: [[486, 1340, 23], [557, 1423, 23], [600, 1457, 23], [712, 1511, 23]]
  };

  // User-reviewed red X marks are the single source of truth. Overlay builders
  // can keep their stable label-box layout while this pass snaps markers,
  // leader lines, and the centerline origin onto the reviewed tee-pad centers.
  function alignTeeMarkers(nextHole) {
    const reviewed = teePadCalibration[nextHole];
    const order = ['红', '白', '蓝', '黑'];
    order.forEach((name, index) => {
      const [x, y] = reviewed[index];
      const group = annotationOverlay.querySelector(`.tee-label[data-tee="${name}"]`);
      if (!group) return;
      const marker = group.querySelector('.tee-marker');
      const rect = group.querySelector('rect');
      const text = group.querySelector('text');
      const line = group.querySelector('path');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      const rectX = Number(rect.getAttribute('x'));
      const rectWidth = Number(rect.getAttribute('width'));
      const labelOnLeft = rectX + rectWidth / 2 < x;
      const labelEdge = labelOnLeft ? rectX + rectWidth : rectX;
      line.setAttribute('d', `M${x + (labelOnLeft ? -8 : 8)} ${y} H${labelEdge}`);
      rect.setAttribute('y', y - 20);
      text.setAttribute('y', y + 6);
    });
    const [blackX, blackY] = reviewed[3];
    const centerline = annotationOverlay.querySelector('.centerline path');
    if (centerline) centerline.setAttribute('d', centerline.getAttribute('d').replace(/^M\s*[\d.]+\s+[\d.]+/, `M${blackX} ${blackY}`));
  }

  function validateTeeMarkers(nextHole) {
    const expected = teePadCalibration[nextHole];
    const order = ['红', '白', '蓝', '黑'];
    const markers = new Map([...annotationOverlay.querySelectorAll('.tee-label')].map((group) => {
      const marker = group.querySelector('.tee-marker');
      return [group.dataset.tee, marker];
    }));
    const seenColors = new Set();
    let valid = expected.length === 4 && markers.size === 4;
    expected.forEach(([x, y, radius], index) => {
      const marker = markers.get(order[index]);
      if (!marker) { valid = false; return; }
      const dx = Number(marker.getAttribute('cx')) - x;
      const dy = Number(marker.getAttribute('cy')) - y;
      const color = marker.getAttribute('fill');
      seenColors.add(color);
      if (Math.hypot(dx, dy) > radius) valid = false;
    });
    annotationOverlay.dataset.teeCalibration = valid && seenColors.size === 4 ? 'pass' : 'fail';
    if (!valid || seenColors.size !== 4) console.error(`Hole ${nextHole}: tee calibration failed`);
  }

  function storageKey(nextHole) {
    return `golfmap.virtual-overlays.cn0000385.hole-${nextHole}`;
  }

  function readStoredOverlay(nextHole) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(nextHole)) || 'null');
    } catch (_) {
      return null;
    }
  }

  function postToParent(type, overlays) {
    if (window.parent === window) return;
    window.parent.postMessage({ source: 'holemap-hd', type, hole, overlays }, '*');
  }

  function normalizeEmbeddedZoom(next) {
    return Math.max(.8, Math.min(4, Number(next) || 1));
  }

  function embeddedAnchor(clientX, clientY) {
    const rect = conceptCanvas.getBoundingClientRect();
    const viewport = conceptCanvas.parentElement.getBoundingClientRect();
    return { u: (clientX - rect.left) / rect.width, v: (clientY - rect.top) / rect.height,
      x: clientX - viewport.left, y: clientY - viewport.top };
  }

  function setEmbeddedZoom(next, { report = true, anchor = null } = {}) {
    embeddedZoom = normalizeEmbeddedZoom(next);
    fitEmbeddedConcept({ anchor, reset: !anchor });
    if (report) postToParent('view-zoom', { zoom: embeddedZoom });
  }

  function assignEditableIds() {
    const featureCounts = new Map();
    annotationOverlay.querySelectorAll('.callout').forEach((group) => {
      const title = group.querySelector('text')?.textContent?.trim() || 'FEATURE';
      const base = (group.dataset.feature || title).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const index = featureCounts.get(base) || 0;
      featureCounts.set(base, index + 1);
      group.dataset.editId = `feature:${base}:${index}`;
      group.querySelector('circle')?.classList.add('draggable-anchor');
    });
    annotationOverlay.querySelectorAll('.tee-label').forEach((group) => {
      group.dataset.editId = `tee:${group.dataset.tee}`;
      group.querySelector('.tee-marker')?.classList.add('draggable-anchor');
    });
    const flag = annotationOverlay.querySelector('.green-flag');
    const flagAnchor = flag?.querySelector('circle');
    if (flag && flagAnchor) {
      flag.dataset.editId = 'flag';
      flag.dataset.baseX = flagAnchor.getAttribute('cx');
      flag.dataset.baseY = flagAnchor.getAttribute('cy');
      flag.dataset.currentX = flag.dataset.baseX;
      flag.dataset.currentY = flag.dataset.baseY;
      flagAnchor.classList.add('draggable-anchor');
    }
  }

  function updateTeePosition(group, x, y) {
    const marker = group.querySelector('.tee-marker');
    const rect = group.querySelector('rect');
    const line = group.querySelector('path');
    if (!marker || !rect || !line) return;
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    const rectX = Number(rect.getAttribute('x'));
    const rectWidth = Number(rect.getAttribute('width'));
    const labelOnLeft = rectX + rectWidth / 2 < x;
    const labelEdge = labelOnLeft ? rectX + rectWidth : rectX;
    line.setAttribute('d', `M${x + (labelOnLeft ? -8 : 8)} ${y} H${labelEdge}`);
    if (group.dataset.tee === '黑') {
      const centerline = annotationOverlay.querySelector('.centerline path');
      if (centerline) centerline.setAttribute('d', centerline.getAttribute('d').replace(/^M\s*[\d.]+\s+[\d.]+/, `M${x} ${y}`));
    }
  }

  function updateFeaturePosition(group, x, y) {
    const anchor = group.querySelector('circle');
    const rect = group.querySelector('rect');
    const line = group.querySelector('path');
    if (!anchor || !rect || !line) return;
    anchor.setAttribute('cx', x);
    anchor.setAttribute('cy', y);
    const rectX = Number(rect.getAttribute('x'));
    const rectY = Number(rect.getAttribute('y'));
    const rectWidth = Number(rect.getAttribute('width'));
    const labelOnLeft = rectX + rectWidth / 2 < x;
    const startX = labelOnLeft ? rectX + rectWidth : rectX;
    const startY = rectY + 30;
    const elbowX = startX + (x - startX) * 0.62;
    line.setAttribute('d', `M${startX} ${startY} H${elbowX.toFixed(1)} L${x} ${y}`);
  }

  function updateFlagPosition(group, x, y) {
    const baseX = Number(group.dataset.baseX);
    const baseY = Number(group.dataset.baseY);
    group.dataset.currentX = x;
    group.dataset.currentY = y;
    group.setAttribute('transform', `translate(${(x - baseX).toFixed(1)} ${(y - baseY).toFixed(1)})`);
  }

  function groupPoint(group) {
    if (group.classList.contains('tee-label')) {
      const marker = group.querySelector('.tee-marker');
      return { x: Number(marker.getAttribute('cx')), y: Number(marker.getAttribute('cy')) };
    }
    if (group.classList.contains('green-flag')) {
      return { x: Number(group.dataset.currentX), y: Number(group.dataset.currentY) };
    }
    const anchor = group.querySelector('circle');
    return { x: Number(anchor.getAttribute('cx')), y: Number(anchor.getAttribute('cy')) };
  }

  function groupLabel(group) {
    if (group.classList.contains('tee-label')) return `${group.dataset.tee} Tee`;
    if (group.classList.contains('green-flag')) return '果岭旗';
    const en = group.querySelector('text')?.textContent?.trim();
    const zh = group.querySelector('.zh')?.textContent?.trim();
    return zh || en || group.dataset.editId;
  }

  function collectOverlayState() {
    const overlays = { version: 2, hole, tees: {}, features: {}, flag: null };
    annotationOverlay.querySelectorAll('.tee-label[data-edit-id]').forEach((group) => {
      const marker = group.querySelector('.tee-marker');
      overlays.tees[group.dataset.tee] = { x: Number(marker.getAttribute('cx')), y: Number(marker.getAttribute('cy')) };
    });
    annotationOverlay.querySelectorAll('.callout[data-edit-id]').forEach((group) => {
      const anchor = group.querySelector('circle');
      overlays.features[group.dataset.editId] = { x: Number(anchor.getAttribute('cx')), y: Number(anchor.getAttribute('cy')) };
    });
    const flag = annotationOverlay.querySelector('.green-flag[data-edit-id="flag"]');
    if (flag) overlays.flag = groupPoint(flag);
    return overlays;
  }

  function collectCalibrationState() {
    const state = collectOverlayState();
    return { hole, tees: state.tees, flag: state.flag, cartRoutePixels: conceptConfig[hole]?.deviceRoute || null,image:{width:conceptConfig[hole]?.width,height:conceptConfig[hole]?.height,asset:conceptConfig[hole]?.asset} };
  }

  function ensureDeviceCartRoute() {
    const points = conceptConfig[hole]?.deviceRoute;
    if (!Array.isArray(points) || points.length < 2) return;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('device-cart-route');
    group.setAttribute('aria-label', `第${hole}洞球车行驶路线`);
    const casing = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const route = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const value = points.map((point) => `${point[0]},${point[1]}`).join(' ');
    casing.setAttribute('points', value);
    casing.classList.add('device-cart-route-casing');
    route.setAttribute('points', value);
    route.classList.add('device-cart-route-line');
    group.append(casing, route);
    annotationOverlay.insertBefore(group, annotationOverlay.querySelector('.centerline'));
  }

  function setDeviceRoute(points = []) {
    if (!Array.isArray(points)) return;
    let group = annotationOverlay.querySelector('.device-cart-route');
    if (!group) {
      group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('device-cart-route');
      const casing = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      casing.classList.add('device-cart-route-casing');
      const route = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      route.classList.add('device-cart-route-line');
      group.append(casing, route);
      annotationOverlay.insertBefore(group, annotationOverlay.querySelector('.centerline'));
    }
    const value = points.map((point) => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(' ');
    group.querySelectorAll('polyline').forEach((line) => line.setAttribute('points', value));
    group.querySelectorAll('.cart-route-node').forEach((node) => node.remove());
    points.forEach((point, index) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      node.classList.add('cart-route-node');
      node.dataset.index = index;
      node.setAttribute('cx', Number(point.x)); node.setAttribute('cy', Number(point.y));
      node.setAttribute('r', '7');
      group.appendChild(node);
    });
  }

  function applyOverlayState(overlays) {
    if (!overlays || Number(overlays.hole || hole) !== hole) return;
    annotationOverlay.querySelectorAll('.tee-label[data-edit-id]').forEach((group) => {
      const point = overlays.tees?.[group.dataset.tee];
      if (point) updateTeePosition(group, Number(point.x), Number(point.y));
    });
    annotationOverlay.querySelectorAll('.callout[data-edit-id]').forEach((group) => {
      const point = overlays.features?.[group.dataset.editId];
      if (point) updateFeaturePosition(group, Number(point.x), Number(point.y));
    });
    const flag = annotationOverlay.querySelector('.green-flag[data-edit-id="flag"]');
    if (flag && overlays.flag) updateFlagPosition(flag, Number(overlays.flag.x), Number(overlays.flag.y));
  }

  function prepareOverlayLayer() {
    ensureDeviceCartRoute();
    assignEditableIds();
    defaultOverlayCalibration = collectCalibrationState();
    const saved = parentOverlayState.get(hole) || readStoredOverlay(hole);
    if (saved) applyOverlayState(saved);
    if (embedHoleTitle) embedHoleTitle.textContent = `第 ${hole} 洞 · 高清虚拟图`;
  }

  function svgPoint(event) {
    const point = annotationOverlay.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = annotationOverlay.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : point;
  }

  function finishDrag() {
    if (!dragState) return;
    const moved = dragState;
    moved.handle.classList.remove('draggable-selected');
    dragState = null;
    if(moved.group.classList.contains('workspace-point')){
      postToParent('workspace-point-moved',{id:moved.group.dataset.pointId,point:{x:Number(moved.group.dataset.x),y:Number(moved.group.dataset.y)}});return;
    }
    if (moved.handle.classList.contains('cart-route-node')) {
      postToParent('cart-route-node-moved', { index: Number(moved.handle.dataset.index), point: {
        x: Number(moved.handle.getAttribute('cx')), y: Number(moved.handle.getAttribute('cy')),
      } });
      return;
    }
    if (moved.group.classList.contains('cart-test')) {
      postToParent('place-cart-position', { point: {
        x: Number(moved.group.dataset.x), y: Number(moved.group.dataset.y),
      } });
      return;
    }
    const overlays = collectOverlayState();
    localStorage.setItem(storageKey(hole), JSON.stringify(overlays));
    if (overlayEditStatus) overlayEditStatus.textContent = '位置已更新；点“保存标注位置”写入当前球洞';
    postToParent('overlays-changed', overlays);
    postToParent('point-moved', { id: moved.group.dataset.editId, label: groupLabel(moved.group), point: groupPoint(moved.group), state: overlays });
  }

  annotationOverlay.addEventListener('pointerdown', (event) => {
    if (!editMode) return;
    if(placementMode==='workspace-point'||placementMode==='control-point'){
      event.preventDefault();event.stopPropagation();const point=svgPoint(event),type=placementMode;placementMode=null;document.body.classList.remove('placing-cart-position');
      postToParent(type==='control-point'?'control-point-picked':'workspace-point-picked',{point:{x:point.x,y:point.y}});return;
    }
    if (placementMode === 'cart-position') {
      event.preventDefault();
      event.stopPropagation();
      const point = svgPoint(event);
      const viewBox = annotationOverlay.viewBox.baseVal;
      placementMode = null;
      document.body.classList.remove('placing-cart-position');
      postToParent('place-cart-position', { point: {
        x: Math.max(0, Math.min(viewBox.width, Math.round(point.x))),
        y: Math.max(0, Math.min(viewBox.height, Math.round(point.y))),
      } });
      return;
    }
    if (placementMode === 'cart-route') {
      event.preventDefault();
      event.stopPropagation();
      const point = svgPoint(event);
      const viewBox = annotationOverlay.viewBox.baseVal;
      postToParent('place-cart-route-node', { point: {
        x: Math.max(0, Math.min(viewBox.width, Math.round(point.x))),
        y: Math.max(0, Math.min(viewBox.height, Math.round(point.y))),
      } });
      return;
    }
    const handle = event.target.closest('.tee-marker, .callout circle, .green-flag circle, .cart-test circle, .workspace-point circle, .cart-route-node');
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const group = handle.closest('.tee-label, .callout, .green-flag, .cart-test, .workspace-point, .device-cart-route');
    dragState = { handle, group, pointerId: event.pointerId };
    handle.classList.add('draggable-selected');
    if(group.classList.contains('workspace-point'))postToParent('workspace-point-selected',{id:group.dataset.pointId});
    else if (!group.classList.contains('cart-test') && !handle.classList.contains('cart-route-node')) postToParent('overlay-selected', { id: group.dataset.editId, label: groupLabel(group), point: groupPoint(group) });
    annotationOverlay.setPointerCapture?.(event.pointerId);
  });
  annotationOverlay.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const viewBox = annotationOverlay.viewBox.baseVal;
    const point = svgPoint(event);
    const x = Math.max(0, Math.min(viewBox.width, Math.round(point.x)));
    const y = Math.max(0, Math.min(viewBox.height, Math.round(point.y)));
    if (dragState.handle.classList.contains('cart-route-node')) {
      dragState.handle.setAttribute('cx', x); dragState.handle.setAttribute('cy', y);
      const value = [...dragState.group.querySelectorAll('.cart-route-node')]
        .map(node => `${node.getAttribute('cx')},${node.getAttribute('cy')}`).join(' ');
      dragState.group.querySelectorAll('polyline').forEach(line => line.setAttribute('points', value));
    }
    else if (dragState.group.classList.contains('cart-test')||dragState.group.classList.contains('workspace-point')) {
      dragState.group.dataset.x = x;
      dragState.group.dataset.y = y;
      dragState.group.setAttribute('transform', `translate(${x} ${y})`);
    }
    else if (dragState.group.classList.contains('tee-label')) updateTeePosition(dragState.group, x, y);
    else if (dragState.group.classList.contains('green-flag')) updateFlagPosition(dragState.group, x, y);
    else updateFeaturePosition(dragState.group, x, y);
  });
  annotationOverlay.addEventListener('pointerup', finishDrag);
  annotationOverlay.addEventListener('pointercancel', finishDrag);

  resetOverlayPositions?.addEventListener('click', () => {
    localStorage.removeItem(storageKey(hole));
    parentOverlayState.delete(hole);
    configureConcept(hole);
    if (overlayEditStatus) overlayEditStatus.textContent = '已恢复本洞默认标注位置';
    postToParent('overlays-reset', null);
  });
  saveOverlayPositions?.addEventListener('click', () => {
    const overlays = collectOverlayState();
    localStorage.setItem(storageKey(hole), JSON.stringify(overlays));
    if (overlayEditStatus) overlayEditStatus.textContent = '标注位置已保存';
    postToParent('overlays-save', overlays);
  });

  function showGpsPoint(point, accuracyPx, appendTrail, label = '实时 GPS 位置') {
    if (!gpsTrail || !gpsTrail.isConnected) {
      gpsTrail = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      gpsTrail.classList.add('gps-device-trail');
      annotationOverlay.appendChild(gpsTrail);
    }
    if (appendTrail) {
      gpsTrailPoints.push([Number(point.x), Number(point.y)]);
      if (gpsTrailPoints.length > 360) gpsTrailPoints.shift();
      gpsTrail.setAttribute('points', gpsTrailPoints.map((item) => `${item[0].toFixed(1)},${item[1].toFixed(1)}`).join(' '));
    }
    if (!gpsMarker || !gpsMarker.isConnected) {
      gpsMarker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gpsMarker.classList.add('gps-live-marker');
      gpsMarker.innerHTML = '<circle class="gps-accuracy"/><circle class="gps-pulse" r="17"/><circle class="gps-fix" r="8"/><text x="15" y="-13">球车位置</text>';
      annotationOverlay.appendChild(gpsMarker);
    }
    gpsMarker.hidden = false;
    gpsMarker.querySelector('text').textContent = label;
    gpsMarker.setAttribute('transform', `translate(${Number(point.x).toFixed(1)} ${Number(point.y).toFixed(1)})`);
    gpsMarker.querySelector('.gps-accuracy').setAttribute('r', Math.max(10, Math.min(180, Number(accuracyPx) || 10)).toFixed(1));
    setDeviceLayers(deviceLayers);
  }

  function hideGpsPoint() {
    if (gpsMarker) gpsMarker.hidden = true;
  }

  function clearGpsTrail() {
    gpsTrailPoints = [];
    if (gpsTrail) gpsTrail.setAttribute('points', '');
  }

  function setDeviceReferences(points = []) {
    if (deviceReferenceLayer) deviceReferenceLayer.remove();
    deviceReferenceLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    deviceReferenceLayer.classList.add('device-reference-layer');
    points.forEach((item, index) => {
      if (!item?.point) return;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('device-reference-point');
      if(item.workspace){group.classList.add('workspace-point');group.dataset.pointId=item.id;}
      if(item.kind==='cart')group.classList.add('cart-test-style');
      if(item.kind==='control')group.classList.add('registration-control');
      if (item.kind === 'cart_test') group.classList.add('cart-test');
      group.dataset.x = Number(item.point.x);
      group.dataset.y = Number(item.point.y);
      group.setAttribute('transform', `translate(${Number(item.point.x).toFixed(1)} ${Number(item.point.y).toFixed(1)})`);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '9');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '15'); text.setAttribute('y', '5');
      text.textContent = item.name || `GPS 参考点 ${index + 1}`;
      group.append(circle, text); deviceReferenceLayer.appendChild(group);
    });
    annotationOverlay.appendChild(deviceReferenceLayer);
  }

  function setDeviceLayers(layers = {}) {
    deviceLayers = { ...deviceLayers, ...layers };
    annotationOverlay.querySelector('.centerline')?.style.setProperty('display', deviceMode ? 'none' : (deviceLayers.route === false ? 'none' : 'block'));
    annotationOverlay.querySelector('.device-cart-route')?.style.setProperty('display', deviceLayers.route === false ? 'none' : 'block');
    annotationOverlay.querySelectorAll('.tee-label, .green-flag').forEach((node) => {
      node.style.display = deviceLayers.anchors === false ? 'none' : 'block';
    });
    if (gpsTrail) gpsTrail.style.display = deviceLayers.trail === false ? 'none' : 'block';
    if (gpsMarker) gpsMarker.querySelector('.gps-accuracy').style.display = deviceLayers.accuracy === false ? 'none' : 'block';
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.source !== 'holemap-parent') return;
    if (message.type === 'load-overlays' && Number(message.hole) === hole) {
      if (message.overlays) {
        parentOverlayState.set(hole, message.overlays);
        applyOverlayState(message.overlays);
      }
    }
    if (message.type === 'set-edit-point' && Number(message.hole) === hole && message.point) {
      const group = message.target === 'flag'
        ? annotationOverlay.querySelector('.green-flag[data-edit-id="flag"]')
        : annotationOverlay.querySelector(`[data-edit-id="${CSS.escape(message.target)}"]`);
      if (!group) return;
      if (group.classList.contains('tee-label')) updateTeePosition(group, Number(message.point.x), Number(message.point.y));
      else if (group.classList.contains('green-flag')) updateFlagPosition(group, Number(message.point.x), Number(message.point.y));
      else updateFeaturePosition(group, Number(message.point.x), Number(message.point.y));
      const overlays = collectOverlayState();
      localStorage.setItem(storageKey(hole), JSON.stringify(overlays));
      postToParent('overlays-save', overlays);
    }
    if (message.type === 'show-gps-point' && Number(message.hole) === hole && message.point) showGpsPoint(message.point, message.accuracyPx, message.appendTrail, message.label);
    if (message.type === 'hide-gps-point') hideGpsPoint();
    if (message.type === 'clear-gps-trail') clearGpsTrail();
    if (message.type === 'set-device-layers') setDeviceLayers(message.layers);
    if (message.type === 'set-device-references' && Number(message.hole) === hole) setDeviceReferences(message.points);
    if(message.type==='set-workspace-overlays'&&Number(message.hole)===hole){
      setDeviceReferences(message.points||[]);
      annotationOverlay.querySelector('.workspace-guide')?.remove();
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.classList.add('workspace-guide');
      const polygon=(points,cls)=>{if(!points?.length)return;const p=document.createElementNS(g.namespaceURI,'polygon');p.setAttribute('points',points.map(v=>v.x+','+v.y).join(' '));p.setAttribute('class',cls);g.append(p);};
      if(message.guide){polygon(message.boundary,'workspace-boundary');polygon(message.hull,'workspace-hull');}
      (message.links||[]).forEach(link=>{const p=document.createElementNS(g.namespaceURI,'line');p.setAttribute('x1',link.a.x);p.setAttribute('y1',link.a.y);p.setAttribute('x2',link.b.x);p.setAttribute('y2',link.b.y);p.setAttribute('class','workspace-distance');g.append(p);const t=document.createElementNS(g.namespaceURI,'text');t.setAttribute('x',(link.a.x+link.b.x)/2);t.setAttribute('y',(link.a.y+link.b.y)/2-8);t.setAttribute('class','workspace-distance-label');t.textContent=link.label;g.append(t);});
      annotationOverlay.insertBefore(g,deviceReferenceLayer);
    }
    if (message.type === 'set-device-route' && Number(message.hole) === hole) setDeviceRoute(message.points);
    if (message.type === 'set-view-zoom' && Number(message.hole) === hole && !deviceMode) {
      setEmbeddedZoom(message.zoom, { report: false });
    }
    if (message.type === 'set-placement-mode' && Number(message.hole) === hole) {
      placementMode = ['cart-position', 'cart-route','workspace-point','control-point'].includes(message.mode) ? message.mode : null;
      document.body.classList.toggle('placing-cart-position', Boolean(placementMode));
    }
  });

  function holeTwoOverlay() {
    return `
      <defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>
      <g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 2 洞 · PAR 4</text><g class="distance-row" transform="translate(700 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">385 m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">365 m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">338 m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">282 m</text></g></g>
      <g class="centerline" aria-label="第2洞球洞中线"><path d="M209 1188 C340 1106 423 1000 499 877 C590 730 698 509 813 218"/></g>
      <g class="green-flag" aria-label="第2洞果岭旗"><path d="M813 218 V132 L877 153 L813 177 Z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="831" y="161" fill="#fff" font-size="23">2</text><circle cx="813" cy="218" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>
      <g class="callout left"><path d="M196 210 H510 L802 218"/><circle cx="813" cy="218" r="5"/><rect x="26" y="180" width="170" height="60"/><text x="45" y="205">GREEN</text><text class="zh" x="45" y="226">果岭 · 果岭旗</text></g>
      <g class="callout right"><path d="M836 342 H778 L727 314"/><circle cx="719" cy="310" r="5"/><rect x="836" y="312" width="170" height="60"/><text x="855" y="337">BUNKER</text><text class="zh" x="855" y="358">沙坑群</text></g>
      <g class="callout right"><path d="M836 670 H750 L631 691"/><circle cx="623" cy="692" r="5"/><rect x="836" y="640" width="170" height="60"/><text x="855" y="665">FAIRWAY</text><text class="zh" x="855" y="686">球道</text></g>
      <g class="callout left"><path d="M196 825 H300 L382 742"/><circle cx="388" cy="736" r="5"/><rect x="26" y="795" width="170" height="60"/><text x="45" y="820">CART PATH</text><text class="zh" x="45" y="841">球车道</text></g>
      <g class="callout right"><path d="M836 934 H795 L846 838"/><circle cx="850" cy="830" r="5"/><rect x="836" y="904" width="170" height="60"/><text x="855" y="929">WATER</text><text class="zh" x="855" y="950">洞内临水区</text></g>
      <g class="callout left"><path d="M196 1007 H292 L350 953"/><circle cx="356" cy="948" r="5"/><rect x="26" y="977" width="170" height="60"/><text x="45" y="1002">TREE BELT</text><text class="zh" x="45" y="1023">树带 · 长草区</text></g>
      <g class="callout right"><path d="M836 1269 H659 L389 1160"/><circle cx="380" cy="1156" r="5"/><rect x="836" y="1239" width="170" height="60"/><text x="855" y="1264">TEE BOX</text><text class="zh" x="855" y="1285">四级发球区</text></g>
      <g class="distance-arcs"><path d="M424 504 Q627 554 799 507"/><rect x="733" y="479" width="78" height="34" rx="17"/><text x="751" y="502">100 m</text><path d="M367 685 Q582 751 790 701"/><rect x="720" y="673" width="78" height="34" rx="17"/><text x="738" y="696">150 m</text><path d="M324 859 Q531 920 722 886"/><rect x="652" y="858" width="78" height="34" rx="17"/><text x="670" y="881">200 m</text></g>
      <g class="tee-label red-tee" data-tee="红"><path d="M374 992 H547"/><circle class="tee-marker" cx="366" cy="992" r="7" fill="#df4242"/><rect x="547" y="972" width="118" height="40"/><text x="562" y="998">红 Tee 282 m</text></g><g class="tee-label white-tee" data-tee="白"><path d="M362 1084 H487"/><circle class="tee-marker" cx="354" cy="1084" r="7" fill="#f8f7ef"/><rect x="487" y="1064" width="118" height="40"/><text x="502" y="1090">白 Tee 338 m</text></g><g class="tee-label blue-tee" data-tee="蓝"><path d="M314 1149 H413"/><circle class="tee-marker" cx="306" cy="1149" r="7" fill="#2d69cf"/><rect x="413" y="1129" width="118" height="40"/><text x="428" y="1155">蓝 Tee 365 m</text></g><g class="tee-label black-tee" data-tee="黑"><path d="M217 1188 H319"/><circle class="tee-marker" cx="209" cy="1188" r="7" fill="#1d1d1b"/><rect x="319" y="1168" width="118" height="40"/><text x="334" y="1194">黑 Tee 385 m</text></g>`;
  }

  function holeThreeOverlay() {
    return `
      <defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>
      <g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 3 洞 · PAR 3</text><g class="distance-row" transform="translate(754 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">175 m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">142 m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">121 m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">94 m</text></g></g>
      <g class="centerline" aria-label="第3洞球洞中线"><path d="M367 1201 C392 1025 423 843 492 675 C555 531 640 446 714 407"/></g>
      <g class="green-flag"><path d="M714 407 V319 L778 340 L714 365 Z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="733" y="348" fill="#fff" font-size="23">3</text><circle cx="714" cy="407" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>
      <g class="callout left"><path d="M200 369 H490 L703 407"/><circle cx="714" cy="407" r="5"/><rect x="26" y="339" width="174" height="60"/><text x="45" y="364">GREEN</text><text class="zh" x="45" y="385">果岭 · 果岭旗</text></g>
      <g class="callout right"><path d="M882 474 H842 L791 463"/><circle cx="783" cy="461" r="5"/><rect x="882" y="444" width="180" height="60"/><text x="901" y="469">BUNKER</text><text class="zh" x="901" y="490">果岭沙坑群</text></g>
      <g class="callout right"><path d="M882 692 H780 L668 663"/><circle cx="660" cy="661" r="5"/><rect x="882" y="662" width="180" height="60"/><text x="901" y="687">APPROACH</text><text class="zh" x="901" y="708">短杆进攻区</text></g>
      <g class="callout left"><path d="M200 806 H314 L378 734"/><circle cx="384" cy="728" r="5"/><rect x="26" y="776" width="174" height="60"/><text x="45" y="801">CART PATH</text><text class="zh" x="45" y="822">球车道</text></g>
      <g class="callout right"><path d="M882 915 H836 L793 827"/><circle cx="789" cy="819" r="5"/><rect x="882" y="885" width="180" height="60"/><text x="901" y="910">TREE BELT</text><text class="zh" x="901" y="931">树带 · 长草区</text></g>
      <g class="callout left"><path d="M200 1142 H300 L454 1112"/><circle cx="463" cy="1110" r="5"/><rect x="26" y="1112" width="174" height="60"/><text x="45" y="1137">TEE BOX</text><text class="zh" x="45" y="1158">四级发球区</text></g>
      <g class="tee-label red-tee" data-tee="红"><path d="M370 820 H532"/><circle class="tee-marker" cx="362" cy="820" r="7" fill="#df4242"/><rect x="532" y="800" width="124" height="40"/><text x="547" y="826">红 Tee 94 m</text></g><g class="tee-label white-tee" data-tee="白"><path d="M362 944 H532"/><circle class="tee-marker" cx="354" cy="944" r="7" fill="#f8f7ef"/><rect x="532" y="924" width="124" height="40"/><text x="547" y="950">白 Tee 121 m</text></g><g class="tee-label blue-tee" data-tee="蓝"><path d="M367 1081 H500"/><circle class="tee-marker" cx="359" cy="1081" r="7" fill="#2d69cf"/><rect x="500" y="1061" width="124" height="40"/><text x="515" y="1087">蓝 Tee 142 m</text></g><g class="tee-label black-tee" data-tee="黑"><path d="M375 1201 H523"/><circle class="tee-marker" cx="367" cy="1201" r="7" fill="#1d1d1b"/><rect x="523" y="1181" width="124" height="40"/><text x="538" y="1207">黑 Tee 175 m</text></g>`;
  }

  function holeFourOverlay() {
    return `
      <defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>
      <g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 4 洞 · PAR 4</text><g class="distance-row" transform="translate(858 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">360 m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">344 m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">315 m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">281 m</text></g></g>
      <g class="centerline" aria-label="第4洞球洞中线"><path d="M982 1219 C924 1023 832 825 698 652 C557 470 421 337 318 242"/></g>
      <g class="green-flag"><path d="M318 242 V151 L385 173 L318 199 Z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="337" y="182" fill="#fff" font-size="23">4</text><circle cx="318" cy="242" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>
      <g class="callout left"><path d="M202 232 H270 L307 242"/><circle cx="318" cy="242" r="5"/><rect x="26" y="202" width="176" height="60"/><text x="45" y="227">GREEN</text><text class="zh" x="45" y="248">果岭 · 果岭旗</text></g>
      <g class="callout right"><path d="M986 335 H718 L423 251"/><circle cx="414" cy="248" r="5"/><rect x="986" y="305" width="186" height="60"/><text x="1005" y="330">BUNKER</text><text class="zh" x="1005" y="351">果岭沙坑</text></g>
      <g class="callout left"><path d="M202 598 H330 L392 566"/><circle cx="400" cy="562" r="5"/><rect x="26" y="568" width="176" height="60"/><text x="45" y="593">BUNKER</text><text class="zh" x="45" y="614">大型球道沙坑</text></g>
      <g class="callout right"><path d="M986 653 H830 L716 621"/><circle cx="708" cy="619" r="5"/><rect x="986" y="623" width="186" height="60"/><text x="1005" y="648">FAIRWAY</text><text class="zh" x="1005" y="669">宽阔球道</text></g>
      <g class="callout right"><path d="M986 799 H936 L933 732"/><circle cx="933" cy="724" r="5"/><rect x="986" y="769" width="186" height="60"/><text x="1005" y="794">CART PATH</text><text class="zh" x="1005" y="815">右缘球车道</text></g>
      <g class="callout left"><path d="M202 867 H341 L520 844"/><circle cx="528" cy="843" r="5"/><rect x="26" y="837" width="176" height="60"/><text x="45" y="862">TREE BELT</text><text class="zh" x="45" y="883">树带 · 长草区</text></g>
      <g class="callout left"><path d="M202 1121 H642 L866 1133"/><circle cx="875" cy="1134" r="5"/><rect x="26" y="1091" width="176" height="60"/><text x="45" y="1116">TEE BOX</text><text class="zh" x="45" y="1137">四级发球区</text></g>
      <g class="distance-arcs"><path d="M481 495 Q664 560 861 523"/><rect x="792" y="495" width="78" height="34" rx="17"/><text x="810" y="518">100 m</text><path d="M552 650 Q743 704 883 676"/><rect x="814" y="648" width="78" height="34" rx="17"/><text x="832" y="671">150 m</text><path d="M652 805 Q824 835 925 814"/><rect x="855" y="786" width="78" height="34" rx="17"/><text x="873" y="809">200 m</text></g>
      <g class="tee-label red-tee" data-tee="红"><path d="M903 933 H752"/><circle class="tee-marker" cx="911" cy="933" r="7" fill="#df4242"/><rect x="628" y="913" width="124" height="40"/><text x="643" y="939">红 Tee 281 m</text></g><g class="tee-label white-tee" data-tee="白"><path d="M954 1032 H788"/><circle class="tee-marker" cx="962" cy="1032" r="7" fill="#f8f7ef"/><rect x="664" y="1012" width="124" height="40"/><text x="679" y="1038">白 Tee 315 m</text></g><g class="tee-label blue-tee" data-tee="蓝"><path d="M977 1113 H806"/><circle class="tee-marker" cx="985" cy="1113" r="7" fill="#2d69cf"/><rect x="682" y="1093" width="124" height="40"/><text x="697" y="1119">蓝 Tee 344 m</text></g><g class="tee-label black-tee" data-tee="黑"><path d="M954 1184 H786"/><circle class="tee-marker" cx="962" cy="1184" r="7" fill="#1d1d1b"/><rect x="662" y="1164" width="124" height="40"/><text x="677" y="1190">黑 Tee 360 m</text></g>`;
  }

  function holeFiveOverlay() {
    return `
      <defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>
      <g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 5 洞 · PAR 4</text><g class="distance-row" transform="translate(766 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">430 m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">406 m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">361 m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">321 m</text></g></g>
      <g class="centerline" aria-label="第5洞球洞中线"><path d="M705 1287 C649 1117 616 906 643 704 C672 493 744 290 805 168"/></g>
      <g class="green-flag"><path d="M805 168 V91 L867 111 L805 135 Z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="823" y="120" fill="#fff" font-size="23">5</text><circle cx="805" cy="168" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>
      <g class="callout left"><path d="M202 177 H522 L794 168"/><circle cx="805" cy="168" r="5"/><rect x="26" y="147" width="176" height="60"/><text x="45" y="172">GREEN</text><text class="zh" x="45" y="193">果岭 · 果岭旗</text></g>
      <g class="callout right"><path d="M896 263 H850 L824 183"/><circle cx="821" cy="175" r="5"/><rect x="896" y="233" width="176" height="60"/><text x="915" y="258">BUNKER</text><text class="zh" x="915" y="279">果岭沙坑</text></g>
      <g class="callout left"><path d="M202 586 H489 L699 613"/><circle cx="708" cy="614" r="5"/><rect x="26" y="556" width="176" height="60"/><text x="45" y="581">BUNKER</text><text class="zh" x="45" y="602">三联球道沙坑</text></g>
      <g class="callout right"><path d="M896 685 H805 L639 671"/><circle cx="631" cy="670" r="5"/><rect x="896" y="655" width="176" height="60"/><text x="915" y="680">FAIRWAY</text><text class="zh" x="915" y="701">球道</text></g>
      <g class="callout right"><path d="M896 842 H852 L829 753"/><circle cx="827" cy="745" r="5"/><rect x="896" y="812" width="176" height="60"/><text x="915" y="837">WATER</text><text class="zh" x="915" y="858">右侧临水区</text></g>
      <g class="callout left"><path d="M202 913 H373 L422 834"/><circle cx="427" cy="827" r="5"/><rect x="26" y="883" width="176" height="60"/><text x="45" y="908">CART PATH</text><text class="zh" x="45" y="929">球车道</text></g>
      <g class="callout left"><path d="M202 1042 H379 L476 1013"/><circle cx="484" cy="1011" r="5"/><rect x="26" y="1012" width="176" height="60"/><text x="45" y="1037">TREE BELT</text><text class="zh" x="45" y="1058">树带 · 长草区</text></g>
      <g class="callout right"><path d="M896 1248 H797 L652 1196"/><circle cx="644" cy="1193" r="5"/><rect x="896" y="1218" width="176" height="60"/><text x="915" y="1243">TEE BOX</text><text class="zh" x="915" y="1264">四级发球区</text></g>
      <g class="distance-arcs"><path d="M532 488 Q683 536 815 506"/><rect x="746" y="478" width="78" height="34" rx="17"/><text x="764" y="501">100 m</text><path d="M480 697 Q648 754 801 720"/><rect x="732" y="692" width="78" height="34" rx="17"/><text x="750" y="715">150 m</text><path d="M469 901 Q626 949 754 927"/><rect x="685" y="899" width="78" height="34" rx="17"/><text x="703" y="922">200 m</text></g>
      <g class="tee-label red-tee" data-tee="红"><path d="M608 1000 H510"/><circle class="tee-marker" cx="600" cy="1000" r="7" fill="#df4242"/><rect x="386" y="980" width="124" height="40"/><text x="401" y="1006">红 Tee 321 m</text></g><g class="tee-label white-tee" data-tee="白"><path d="M633 1120 H510"/><circle class="tee-marker" cx="625" cy="1120" r="7" fill="#f8f7ef"/><rect x="386" y="1100" width="124" height="40"/><text x="401" y="1126">白 Tee 361 m</text></g><g class="tee-label blue-tee" data-tee="蓝"><path d="M658 1215 H789"/><circle class="tee-marker" cx="650" cy="1215" r="7" fill="#2d69cf"/><rect x="789" y="1195" width="124" height="40"/><text x="804" y="1221">蓝 Tee 406 m</text></g><g class="tee-label black-tee" data-tee="黑"><path d="M713 1287 H824"/><circle class="tee-marker" cx="705" cy="1287" r="7" fill="#1d1d1b"/><rect x="824" y="1267" width="124" height="40"/><text x="839" y="1293">黑 Tee 430 m</text></g>`;
  }

  function holeSixOverlay() {
    return `
      <defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>
      <g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 6 洞 · PAR 5</text><g class="distance-row" transform="translate(680 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">521 m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">479 m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">466 m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">427 m</text></g></g>
      <g class="centerline" aria-label="第6洞球洞中线"><path d="M323 1455 C357 1247 423 1076 487 891 C556 690 584 403 570 157"/></g>
      <g class="green-flag"><path d="M570 157 V80 L632 100 L570 124 Z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="588" y="109" fill="#fff" font-size="23">6</text><circle cx="570" cy="157" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>
      <g class="callout left"><path d="M196 170 H396 L559 157"/><circle cx="570" cy="157" r="5"/><rect x="26" y="140" width="170" height="60"/><text x="45" y="165">GREEN</text><text class="zh" x="45" y="186">果岭 · 果岭旗</text></g>
      <g class="callout left"><path d="M196 337 H386 L493 295"/><circle cx="501" cy="292" r="5"/><rect x="26" y="307" width="170" height="60"/><text x="45" y="332">BUNKER</text><text class="zh" x="45" y="353">果岭沙坑</text></g>
      <g class="callout right"><path d="M807 482 H762 L722 389"/><circle cx="719" cy="381" r="5"/><rect x="807" y="452" width="170" height="60"/><text x="826" y="477">WATER</text><text class="zh" x="826" y="498">大水障碍</text></g>
      <g class="callout left"><path d="M196 702 H356 L486 742"/><circle cx="494" cy="744" r="5"/><rect x="26" y="672" width="170" height="60"/><text x="45" y="697">FAIRWAY</text><text class="zh" x="45" y="718">第一落点球道</text></g>
      <g class="callout right"><path d="M807 834 H699 L556 819"/><circle cx="548" cy="818" r="5"/><rect x="807" y="804" width="170" height="60"/><text x="826" y="829">BUNKER</text><text class="zh" x="826" y="850">球道沙坑群</text></g>
      <g class="callout right"><path d="M807 1005 H703 L620 979"/><circle cx="612" cy="977" r="5"/><rect x="807" y="975" width="170" height="60"/><text x="826" y="1000">CART PATH</text><text class="zh" x="826" y="1021">右缘球车道</text></g>
      <g class="callout left"><path d="M196 1113 H315 L362 1068"/><circle cx="368" cy="1062" r="5"/><rect x="26" y="1083" width="170" height="60"/><text x="45" y="1108">TREE BELT</text><text class="zh" x="45" y="1129">树带 · 长草区</text></g>
      <g class="callout right"><path d="M807 1393 H660 L425 1342"/><circle cx="416" cy="1340" r="5"/><rect x="807" y="1363" width="170" height="60"/><text x="826" y="1388">TEE BOX</text><text class="zh" x="826" y="1409">四级发球区</text></g>
      <g class="distance-arcs"><path d="M326 764 Q511 819 661 786"/><rect x="592" y="758" width="78" height="34" rx="17"/><text x="610" y="781">100 m</text><path d="M313 948 Q492 1005 651 976"/><rect x="582" y="948" width="78" height="34" rx="17"/><text x="600" y="971">150 m</text><path d="M312 1121 Q481 1172 626 1148"/><rect x="557" y="1120" width="78" height="34" rx="17"/><text x="575" y="1143">200 m</text></g>
      <g class="tee-label red-tee" data-tee="红"><path d="M418 1305 H570"/><circle class="tee-marker" cx="410" cy="1305" r="7" fill="#df4242"/><rect x="570" y="1285" width="124" height="40"/><text x="585" y="1311">红 Tee 427 m</text></g><g class="tee-label white-tee" data-tee="白"><path d="M383 1348 H541"/><circle class="tee-marker" cx="375" cy="1348" r="7" fill="#f8f7ef"/><rect x="541" y="1328" width="124" height="40"/><text x="556" y="1354">白 Tee 466 m</text></g><g class="tee-label blue-tee" data-tee="蓝"><path d="M351 1400 H486"/><circle class="tee-marker" cx="343" cy="1400" r="7" fill="#2d69cf"/><rect x="486" y="1380" width="124" height="40"/><text x="501" y="1406">蓝 Tee 479 m</text></g><g class="tee-label black-tee" data-tee="黑"><path d="M331 1455 H469"/><circle class="tee-marker" cx="323" cy="1455" r="7" fill="#1d1d1b"/><rect x="469" y="1435" width="124" height="40"/><text x="484" y="1461">黑 Tee 521 m</text></g>`;
  }

  function makeFeatureCallout({ x, y, tx, ty, label, zh, width = 180 }) {
    const fromX = x < tx ? x + width : x;
    const elbowX = Math.round((fromX + tx) / 2);
    return `<g class="callout"><path d="M${fromX} ${y + 30} H${elbowX} L${tx} ${ty}"/><circle cx="${tx}" cy="${ty}" r="5"/><rect x="${x}" y="${y}" width="${width}" height="60"/><text x="${x + 19}" y="${y + 25}">${label}</text><text class="zh" x="${x + 19}" y="${y + 46}">${zh}</text></g>`;
  }

  function makeTeeLabel({ x, y, bx, by, color, name, distance }) {
    const lineEnd = bx < x ? bx + 126 : bx;
    return `<g class="tee-label" data-tee="${name}"><path d="M${x} ${y} H${lineEnd}"/><circle class="tee-marker" cx="${x}" cy="${y}" r="7" fill="${color}"/><rect x="${bx}" y="${by}" width="126" height="40"/><text x="${bx + 15}" y="${by + 26}">${name} Tee ${distance} m</text></g>`;
  }

  function standardOverlay(cfg) {
    const distanceX = cfg.width - 335;
    const [black, blue, white, red] = cfg.distances;
    const title = `<g class="map-title"><text x="42" y="54">TAIZHOU YUNHAI WETLAND GOLF</text><text class="hole-title" x="42" y="91">第 ${cfg.hole} 洞 · PAR ${cfg.par}</text><g class="distance-row" transform="translate(${distanceX} 48)"><circle cx="0" cy="0" r="7" fill="#1d1d1b" stroke="#fff" stroke-width="2"/><text x="14" y="5">${black} m</text><circle cx="76" cy="0" r="7" fill="#2d69cf" stroke="#fff" stroke-width="2"/><text x="90" y="5">${blue} m</text><circle cx="0" cy="27" r="7" fill="#f8f7ef" stroke="#77806d" stroke-width="2"/><text x="14" y="32">${white} m</text><circle cx="76" cy="27" r="7" fill="#df4242" stroke="#fff" stroke-width="2"/><text x="90" y="32">${red} m</text></g></g>`;
    const flag = `<g class="green-flag"><path d="M${cfg.flag.x} ${cfg.flag.y} v-82 l64 21 l-64 25 z" fill="#d93b31" stroke="#9e261e" stroke-width="2"/><text x="${cfg.flag.x + 19}" y="${cfg.flag.y - 53}" fill="#fff" font-size="23">${cfg.hole}</text><circle cx="${cfg.flag.x}" cy="${cfg.flag.y}" r="8" fill="#f3a421" stroke="#fff" stroke-width="2"/></g>`;
    const centerline = `<g class="centerline" aria-label="第${cfg.hole}洞球洞中线"><path d="${cfg.centerline}"/></g>`;
    const defs = `<defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#071006" flood-opacity=".42"/></filter></defs>`;
    return defs + title + centerline + flag + cfg.features.map(makeFeatureCallout).join('') + cfg.tees.map(makeTeeLabel).join('') + (cfg.arcs || '');
  }

  function holeSevenOverlay() {
    return standardOverlay({ hole: 7, par: 4, width: 1293, distances: [422, 405, 316, 290], flag: { x: 277, y: 949 }, centerline: 'M1039 67 C943 232 819 403 679 565 C531 735 393 861 277 949', features: [
      { x: 26, y: 885, tx: 277, ty: 949, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 1085, y: 392, tx: 874, ty: 407, label: 'BUNKER', zh: '沿水长沙坑' }, { x: 1085, y: 566, tx: 672, ty: 597, label: 'FAIRWAY', zh: '球道' }, { x: 1085, y: 735, tx: 910, ty: 682, label: 'WATER', zh: '右侧河道' }, { x: 26, y: 531, tx: 380, ty: 510, label: 'CART PATH', zh: '球车道' }, { x: 26, y: 687, tx: 410, ty: 675, label: 'TREE BELT', zh: '树带 · 长草区' }, { x: 1085, y: 171, tx: 1044, ty: 153, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 1039, y: 67, bx: 872, by: 47, color: '#1d1d1b', name: '黑', distance: 422 }, { x: 1028, y: 126, bx: 860, by: 106, color: '#2d69cf', name: '蓝', distance: 405 }, { x: 1006, y: 184, bx: 836, by: 164, color: '#f8f7ef', name: '白', distance: 316 }, { x: 965, y: 235, bx: 795, by: 215, color: '#df4242', name: '红', distance: 290 }
    ], arcs: `<g class="distance-arcs"><path d="M408 727 Q605 780 805 736"/><rect x="742" y="708" width="78" height="34" rx="17"/><text x="760" y="731">100 m</text><path d="M481 584 Q675 632 850 594"/><rect x="786" y="566" width="78" height="34" rx="17"/><text x="804" y="589">150 m</text><path d="M604 447 Q756 486 892 457"/><rect x="828" y="429" width="78" height="34" rx="17"/><text x="846" y="452">200 m</text></g>` });
  }

  function holeEightOverlay() {
    return standardOverlay({ hole: 8, par: 5, width: 947, distances: [535, 514, 487, 398], flag: { x: 625, y: 249 }, centerline: 'M226 1510 C294 1271 385 1042 503 826 C580 685 609 457 625 249', features: [
      { x: 26, y: 222, tx: 625, ty: 249, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 751, y: 361, tx: 661, ty: 354, label: 'BUNKER', zh: '沙坑群' }, { x: 751, y: 686, tx: 533, ty: 760, label: 'FAIRWAY', zh: '长五杆球道' }, { x: 26, y: 742, tx: 320, ty: 790, label: 'WATER', zh: '左侧连续水域' }, { x: 751, y: 933, tx: 651, ty: 921, label: 'CART PATH', zh: '右缘球车道' }, { x: 26, y: 1045, tx: 420, ty: 1042, label: 'TREE BELT', zh: '树带 · 长草区' }, { x: 751, y: 1431, tx: 236, ty: 1430, label: 'TEE BOX', zh: '临水四级发球区' }
    ], tees: [
      { x: 226, y: 1510, bx: 352, by: 1490, color: '#1d1d1b', name: '黑', distance: 535 }, { x: 224, y: 1458, bx: 350, by: 1438, color: '#2d69cf', name: '蓝', distance: 514 }, { x: 229, y: 1401, bx: 355, by: 1381, color: '#f8f7ef', name: '白', distance: 487 }, { x: 236, y: 1320, bx: 362, by: 1300, color: '#df4242', name: '红', distance: 398 }
    ], arcs: `<g class="distance-arcs"><path d="M337 555 Q500 608 678 568"/><rect x="615" y="540" width="78" height="34" rx="17"/><text x="633" y="563">100 m</text><path d="M324 751 Q496 811 665 773"/><rect x="602" y="745" width="78" height="34" rx="17"/><text x="620" y="768">150 m</text><path d="M314 947 Q486 1004 643 971"/><rect x="580" y="943" width="78" height="34" rx="17"/><text x="598" y="966">200 m</text></g>` });
  }

  function holeNineOverlay() {
    return standardOverlay({ hole: 9, par: 3, width: 1222, distances: [181, 164, 139, 99], flag: { x: 789, y: 374 }, centerline: 'M350 918 C485 818 600 688 696 548 C735 491 767 427 789 374', features: [
      { x: 26, y: 343, tx: 789, ty: 374, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 1016, y: 353, tx: 898, ty: 358, label: 'BUNKER', zh: '果岭沙坑群' }, { x: 26, y: 607, tx: 568, ty: 636, label: 'WATER', zh: '跨水主障碍' }, { x: 1016, y: 714, tx: 751, ty: 708, label: 'BRIDGE', zh: '连接桥 · 球车道' }, { x: 1016, y: 901, tx: 688, ty: 845, label: 'TREE BELT', zh: '树带 · 长草区' }, { x: 26, y: 914, tx: 486, ty: 849, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 350, y: 918, bx: 180, by: 898, color: '#1d1d1b', name: '黑', distance: 181 }, { x: 478, y: 865, bx: 308, by: 845, color: '#2d69cf', name: '蓝', distance: 164 }, { x: 624, y: 809, bx: 454, by: 789, color: '#f8f7ef', name: '白', distance: 139 }, { x: 744, y: 761, bx: 574, by: 741, color: '#df4242', name: '红', distance: 99 }
    ] });
  }

  function holeTenOverlay() {
    return standardOverlay({ hole: 10, par: 4, width: 1005, distances: [377, 360, 332, 306], flag: { x: 386, y: 279 }, centerline: 'M388 1409 C350 1176 351 940 391 726 C423 554 417 396 386 279', features: [
      { x: 26, y: 248, tx: 386, ty: 279, label: 'GREEN', zh: '果岭 · 果岭旗' },
      { x: 799, y: 280, tx: 328, ty: 301, label: 'BUNKER', zh: '果岭四座沙坑' },
      { x: 799, y: 646, tx: 411, ty: 700, label: 'BUNKER', zh: '三联球道沙坑' },
      { x: 799, y: 822, tx: 390, ty: 848, label: 'FAIRWAY', zh: '宽阔弧形球道' },
      { x: 26, y: 934, tx: 237, ty: 923, label: 'CART PATH', zh: '左缘球车道' },
      { x: 799, y: 1035, tx: 443, ty: 1018, label: 'TREE BELT', zh: '树带 · 长草区' },
      { x: 26, y: 1302, tx: 336, ty: 1318, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 388, y: 1409, bx: 514, by: 1389, color: '#1d1d1b', name: '黑', distance: 377 },
      { x: 339, y: 1349, bx: 465, by: 1329, color: '#2d69cf', name: '蓝', distance: 360 },
      { x: 296, y: 1292, bx: 422, by: 1272, color: '#f8f7ef', name: '白', distance: 332 },
      { x: 286, y: 1238, bx: 412, by: 1218, color: '#df4242', name: '红', distance: 306 }
    ], arcs: `<g class="distance-arcs"><path d="M242 585 Q395 633 565 594"/><rect x="502" y="566" width="78" height="34" rx="17"/><text x="520" y="589">100 m</text><path d="M236 778 Q391 828 558 793"/><rect x="495" y="765" width="78" height="34" rx="17"/><text x="513" y="788">150 m</text><path d="M239 967 Q388 1017 542 986"/><rect x="479" y="958" width="78" height="34" rx="17"/><text x="497" y="981">200 m</text></g>` });
  }

  function holeElevenOverlay() {
    return standardOverlay({ hole: 11, par: 4, width: 1060, distances: [326, 309, 292, 264], flag: { x: 716, y: 337 }, centerline: 'M388 1329 C447 1110 500 895 580 687 C635 545 684 418 716 337', features: [
      { x: 854, y: 306, tx: 716, ty: 337, label: 'GREEN', zh: '果岭 · 果岭旗' },
      { x: 854, y: 429, tx: 625, ty: 387, label: 'BUNKER', zh: '果岭沙坑群' },
      { x: 26, y: 604, tx: 555, ty: 620, label: 'FAIRWAY', zh: '球道' },
      { x: 26, y: 782, tx: 442, ty: 758, label: 'CART PATH', zh: '左缘球车道' },
      { x: 854, y: 862, tx: 615, ty: 830, label: 'TREE BELT', zh: '树带 · 长草区' },
      { x: 26, y: 1198, tx: 392, ty: 1204, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 388, y: 1329, bx: 514, by: 1309, color: '#1d1d1b', name: '黑', distance: 326 },
      { x: 401, y: 1272, bx: 527, by: 1252, color: '#2d69cf', name: '蓝', distance: 309 },
      { x: 419, y: 1206, bx: 545, by: 1186, color: '#f8f7ef', name: '白', distance: 292 },
      { x: 445, y: 1127, bx: 571, by: 1107, color: '#df4242', name: '红', distance: 264 }
    ], arcs: `<g class="distance-arcs"><path d="M474 575 Q623 621 773 586"/><rect x="710" y="558" width="78" height="34" rx="17"/><text x="728" y="581">100 m</text><path d="M436 758 Q594 809 750 776"/><rect x="687" y="748" width="78" height="34" rx="17"/><text x="705" y="771">150 m</text><path d="M407 925 Q560 976 710 946"/><rect x="647" y="918" width="78" height="34" rx="17"/><text x="665" y="941">200 m</text></g>` });
  }

  function holeTwelveOverlay() {
    return standardOverlay({ hole: 12, par: 3, width: 1078, distances: [160, 135, 116, 102], flag: { x: 491, y: 319 }, centerline: 'M374 833 C386 699 410 576 444 459 C459 406 475 356 491 319', features: [
      { x: 26, y: 288, tx: 491, ty: 319, label: 'GREEN', zh: '果岭 · 果岭旗' },
      { x: 872, y: 321, tx: 443, ty: 372, label: 'BUNKER', zh: '果岭三座沙坑' },
      { x: 872, y: 633, tx: 471, ty: 682, label: 'WATER', zh: '洞内中央水塘' },
      { x: 26, y: 772, tx: 330, ty: 748, label: 'CART PATH', zh: '左缘球车道' },
      { x: 872, y: 874, tx: 585, ty: 818, label: 'TREE BELT', zh: '树带 · 长草区' },
      { x: 26, y: 1023, tx: 369, ty: 830, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 374, y: 833, bx: 500, by: 813, color: '#1d1d1b', name: '黑', distance: 160 },
      { x: 365, y: 758, bx: 491, by: 738, color: '#2d69cf', name: '蓝', distance: 135 },
      { x: 361, y: 683, bx: 487, by: 663, color: '#f8f7ef', name: '白', distance: 116 },
      { x: 382, y: 608, bx: 508, by: 588, color: '#df4242', name: '红', distance: 102 }
    ] });
  }

  function holeThirteenOverlay() {
    return standardOverlay({ hole: 13, par: 5, width: 1050, distances: [579, 562, 518, 460], flag: { x: 802, y: 218 }, centerline: 'M310 1371 C455 1244 560 1064 596 852 C626 675 575 522 640 385 C694 274 754 233 802 218', features: [
      { x: 844, y: 187, tx: 802, ty: 218, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 844, y: 298, tx: 734, ty: 271, label: 'BUNKER', zh: '果岭沙坑群' },
      { x: 26, y: 531, tx: 411, ty: 535, label: 'FAIRWAY', zh: '第二落点球道' }, { x: 844, y: 650, tx: 582, ty: 725, label: 'FAIRWAY', zh: '第一落点球道' },
      { x: 26, y: 793, tx: 460, ty: 820, label: 'BUNKER', zh: '沿水长沙坑' }, { x: 844, y: 882, tx: 755, ty: 809, label: 'CART PATH', zh: '球车道 · 连接路' },
      { x: 26, y: 1008, tx: 319, ty: 960, label: 'WATER', zh: '洞内主水障碍' }, { x: 844, y: 1064, tx: 686, ty: 1040, label: 'TREE BELT', zh: '树带 · 长草区' },
      { x: 26, y: 1307, tx: 420, ty: 1338, label: 'TEE BOX', zh: '临水四级发球区' }
    ], tees: [
      { x: 310, y: 1371, bx: 436, by: 1351, color: '#1d1d1b', name: '黑', distance: 579 }, { x: 415, y: 1367, bx: 541, by: 1347, color: '#2d69cf', name: '蓝', distance: 562 },
      { x: 535, y: 1363, bx: 661, by: 1343, color: '#f8f7ef', name: '白', distance: 518 }, { x: 683, y: 1250, bx: 809, by: 1230, color: '#df4242', name: '红', distance: 460 }
    ], arcs: `<g class="distance-arcs"><path d="M379 502 Q548 555 744 517"/><rect x="681" y="489" width="78" height="34" rx="17"/><text x="699" y="512">100 m</text><path d="M395 687 Q567 741 750 705"/><rect x="687" y="677" width="78" height="34" rx="17"/><text x="705" y="700">150 m</text><path d="M432 870 Q599 919 763 890"/><rect x="700" y="862" width="78" height="34" rx="17"/><text x="718" y="885">200 m</text></g>` });
  }

  function holeFourteenOverlay() {
    return standardOverlay({ hole: 14, par: 4, width: 1244, distances: [362, 351, 300, 256], flag: { x: 916, y: 265 }, centerline: 'M310 957 C465 895 589 806 684 681 C790 541 856 390 916 265', features: [
      { x: 1038, y: 234, tx: 916, ty: 265, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 1038, y: 355, tx: 960, ty: 326, label: 'BUNKER', zh: '果岭沙坑' },
      { x: 26, y: 501, tx: 715, ty: 514, label: 'FAIRWAY', zh: '临水球道' }, { x: 1038, y: 612, tx: 891, ty: 570, label: 'BUNKER', zh: '球道沙坑群' },
      { x: 26, y: 712, tx: 554, ty: 711, label: 'WATER', zh: '跨水主障碍' }, { x: 1038, y: 806, tx: 996, ty: 746, label: 'CART PATH', zh: '右缘球车道' },
      { x: 26, y: 931, tx: 302, ty: 934, label: 'TEE BOX', zh: '隔水四级发球区' }, { x: 1038, y: 1017, tx: 421, ty: 930, label: 'BRIDGE', zh: '球车连接桥' }
    ], tees: [
      { x: 310, y: 957, bx: 136, by: 937, color: '#1d1d1b', name: '黑', distance: 362 }, { x: 244, y: 911, bx: 70, by: 891, color: '#2d69cf', name: '蓝', distance: 351 },
      { x: 176, y: 878, bx: 302, by: 858, color: '#f8f7ef', name: '白', distance: 300 }, { x: 638, y: 849, bx: 764, by: 829, color: '#df4242', name: '红', distance: 256 }
    ], arcs: `<g class="distance-arcs"><path d="M602 470 Q750 516 901 483"/><rect x="838" y="455" width="78" height="34" rx="17"/><text x="856" y="478">100 m</text><path d="M540 638 Q710 690 877 656"/><rect x="814" y="628" width="78" height="34" rx="17"/><text x="832" y="651">150 m</text><path d="M470 787 Q641 838 803 808"/><rect x="740" y="780" width="78" height="34" rx="17"/><text x="758" y="803">200 m</text></g>` });
  }

  function holeFifteenOverlay() {
    return standardOverlay({ hole: 15, par: 4, width: 1103, distances: [401, 375, 355, 311], flag: { x: 788, y: 279 }, centerline: 'M286 1128 C338 1049 430 917 530 789 C627 665 704 502 755 377 C769 343 780 309 788 279', features: [
      { x: 897, y: 248, tx: 788, ty: 279, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 897, y: 384, tx: 726, ty: 346, label: 'BUNKER', zh: '果岭沙坑群' },
      { x: 26, y: 555, tx: 562, ty: 575, label: 'FAIRWAY', zh: '宽阔球道' }, { x: 897, y: 683, tx: 691, ty: 636, label: 'BUNKER', zh: '球道沙坑群' },
      { x: 26, y: 824, tx: 386, ty: 818, label: 'WATER', zh: '洞内中央水塘' }, { x: 897, y: 938, tx: 702, ty: 951, label: 'BRIDGE', zh: '球车连接桥' },
      { x: 26, y: 1034, tx: 432, ty: 1006, label: 'TREE BELT', zh: '树带 · 长草区' }, { x: 897, y: 1193, tx: 265, ty: 1153, label: 'TEE BOX', zh: '四级发球区' }
    ], tees: [
      { x: 286, y: 1128, bx: 412, by: 1108, color: '#1d1d1b', name: '黑', distance: 401 }, { x: 297, y: 1084, bx: 423, by: 1064, color: '#2d69cf', name: '蓝', distance: 375 },
      { x: 309, y: 1038, bx: 435, by: 1018, color: '#f8f7ef', name: '白', distance: 355 }, { x: 321, y: 983, bx: 447, by: 963, color: '#df4242', name: '红', distance: 311 }
    ], arcs: `<g class="distance-arcs"><path d="M431 500 Q603 551 797 512"/><rect x="734" y="484" width="78" height="34" rx="17"/><text x="752" y="507">100 m</text><path d="M399 678 Q577 731 772 696"/><rect x="709" y="668" width="78" height="34" rx="17"/><text x="727" y="691">150 m</text><path d="M367 849 Q548 902 735 870"/><rect x="672" y="842" width="78" height="34" rx="17"/><text x="690" y="865">200 m</text></g>` });
  }

  function holeSixteenOverlay() {
    return standardOverlay({ hole: 16, par: 3, width: 1551, distances: [166, 150, 133, 102], flag: { x: 1026, y: 559 }, centerline: 'M375 425 C542 422 735 463 881 518 C934 538 982 552 1026 559', features: [
      { x: 1275, y: 528, tx: 1026, ty: 559, label: 'GREEN', zh: '果岭 · 果岭旗', width: 220 }, { x: 1275, y: 655, tx: 925, ty: 671, label: 'BUNKER', zh: '果岭沙坑群', width: 220 },
      { x: 26, y: 541, tx: 687, ty: 598, label: 'WATER', zh: '林间湿地水域', width: 220 }, { x: 26, y: 721, tx: 500, ty: 720, label: 'TREE BELT', zh: '树带 · 长草区', width: 220 },
      { x: 1275, y: 802, tx: 1185, ty: 730, label: 'CART PATH', zh: '外围球车道', width: 220 }, { x: 26, y: 333, tx: 452, ty: 393, label: 'TEE BOX', zh: '四级发球区', width: 220 }
    ], tees: [
      { x: 375, y: 425, bx: 201, by: 405, color: '#1d1d1b', name: '黑', distance: 166 }, { x: 477, y: 397, bx: 303, by: 377, color: '#2d69cf', name: '蓝', distance: 150 },
      { x: 570, y: 370, bx: 396, by: 350, color: '#f8f7ef', name: '白', distance: 133 }, { x: 701, y: 339, bx: 827, by: 319, color: '#df4242', name: '红', distance: 102 }
    ] });
  }

  function holeSeventeenOverlay() {
    return standardOverlay({ hole: 17, par: 4, width: 1740, distances: [428, 411, 385, 339], flag: { x: 1466, y: 402 }, centerline: 'M277 383 C497 494 742 585 973 577 C1160 570 1341 486 1466 402', features: [
      { x: 1494, y: 371, tx: 1466, ty: 402, label: 'GREEN', zh: '果岭 · 果岭旗', width: 220 }, { x: 1494, y: 495, tx: 1399, ty: 458, label: 'BUNKER', zh: '果岭沙坑', width: 220 },
      { x: 26, y: 322, tx: 852, ty: 455, label: 'BUNKER', zh: '连续沿水长沙坑', width: 220 }, { x: 1494, y: 620, tx: 1017, ty: 574, label: 'FAIRWAY', zh: '横向弯曲球道', width: 220 },
      { x: 26, y: 651, tx: 741, ty: 612, label: 'WATER', zh: '洞内环绕水障碍', width: 220 }, { x: 1494, y: 748, tx: 1178, ty: 666, label: 'CART PATH', zh: '下缘球车道', width: 220 },
      { x: 26, y: 777, tx: 372, ty: 469, label: 'TEE BOX', zh: '临水四级发球区', width: 220 }
    ], tees: [
      { x: 277, y: 383, bx: 103, by: 363, color: '#1d1d1b', name: '黑', distance: 428 }, { x: 322, y: 427, bx: 148, by: 407, color: '#2d69cf', name: '蓝', distance: 411 },
      { x: 406, y: 474, bx: 232, by: 454, color: '#f8f7ef', name: '白', distance: 385 }, { x: 532, y: 557, bx: 658, by: 537, color: '#df4242', name: '红', distance: 339 }
    ], arcs: `<g class="distance-arcs"><path d="M1188 444 Q1327 482 1452 456"/><rect x="1389" y="428" width="78" height="34" rx="17"/><text x="1407" y="451">100 m</text><path d="M1008 520 Q1193 570 1363 540"/><rect x="1300" y="512" width="78" height="34" rx="17"/><text x="1318" y="535">150 m</text><path d="M805 580 Q1012 633 1200 603"/><rect x="1137" y="575" width="78" height="34" rx="17"/><text x="1155" y="598">200 m</text></g>` });
  }

  function holeEighteenOverlay() {
    return standardOverlay({ hole: 18, par: 5, width: 958, distances: [529, 507, 484, 443], flag: { x: 309, y: 271 }, centerline: 'M708 1518 C580 1326 473 1145 420 952 C371 773 398 586 359 423 C341 351 321 299 309 271', features: [
      { x: 26, y: 240, tx: 309, ty: 271, label: 'GREEN', zh: '果岭 · 果岭旗' }, { x: 762, y: 300, tx: 424, ty: 316, label: 'BUNKER', zh: '果岭沙坑群' },
      { x: 762, y: 588, tx: 439, ty: 617, label: 'FAIRWAY', zh: '第二落点球道' }, { x: 26, y: 781, tx: 389, ty: 805, label: 'FAIRWAY', zh: '第一落点球道' },
      { x: 762, y: 874, tx: 612, ty: 846, label: 'WATER', zh: '洞内大型水障碍' }, { x: 26, y: 1035, tx: 242, ty: 1018, label: 'TREE BELT', zh: '树带 · 长草区' },
      { x: 762, y: 1182, tx: 391, ty: 1169, label: 'CART PATH', zh: '球车道 · 连接路' }, { x: 26, y: 1436, tx: 515, ty: 1420, label: 'TEE BOX', zh: '临水四级发球区' }
    ], tees: [
      { x: 708, y: 1518, bx: 834, by: 1498, color: '#1d1d1b', name: '黑', distance: 529 }, { x: 625, y: 1465, bx: 751, by: 1445, color: '#2d69cf', name: '蓝', distance: 507 },
      { x: 546, y: 1409, bx: 372, by: 1389, color: '#f8f7ef', name: '白', distance: 484 }, { x: 462, y: 1316, bx: 288, by: 1296, color: '#df4242', name: '红', distance: 443 }
    ], arcs: `<g class="distance-arcs"><path d="M246 477 Q398 525 559 490"/><rect x="496" y="462" width="78" height="34" rx="17"/><text x="514" y="485">100 m</text><path d="M225 676 Q389 730 554 696"/><rect x="491" y="668" width="78" height="34" rx="17"/><text x="509" y="691">150 m</text><path d="M216 875 Q375 927 526 898"/><rect x="463" y="870" width="78" height="34" rx="17"/><text x="481" y="893">200 m</text></g>` });
  }

  function configureConcept(nextHole) {
    const config = conceptConfig[nextHole];
    if (!config) return;
    conceptCanvas.style.setProperty('--concept-width', `${config.width}px`);
    conceptCanvas.style.setProperty('--concept-ratio', `${config.width} / ${config.height}`);
    annotationOverlay.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
    annotationOverlay.setAttribute('aria-label', `第 ${nextHole} 洞功能标识`);
    const overlays = { 2: holeTwoOverlay, 3: holeThreeOverlay, 4: holeFourOverlay, 5: holeFiveOverlay, 6: holeSixOverlay, 7: holeSevenOverlay, 8: holeEightOverlay, 9: holeNineOverlay, 10: holeTenOverlay, 11: holeElevenOverlay, 12: holeTwelveOverlay, 13: holeThirteenOverlay, 14: holeFourteenOverlay, 15: holeFifteenOverlay, 16: holeSixteenOverlay, 17: holeSeventeenOverlay, 18: holeEighteenOverlay };
    annotationOverlay.innerHTML = nextHole === 1 ? holeOneOverlay : overlays[nextHole]();
    gpsMarker = null;
    gpsTrail = null;
    gpsTrailPoints = [];
    deviceReferenceLayer = null;
    alignTeeMarkers(nextHole);
    validateTeeMarkers(nextHole);
    prepareOverlayLayer();
    conceptImage.src = config.asset;
    conceptImage.alt = `第 ${nextHole} 洞高清虚拟图材质样板`;
    requestAnimationFrame(fitEmbeddedConcept);
  }

  function fitEmbeddedConcept({ anchor = null, reset = false } = {}) {
    if (!embedMode || !conceptCanvas || !conceptCanvas.parentElement) return;
    const config = conceptConfig[hole];
    if (!config) return;

    const container = conceptCanvas.parentElement;
    const style = getComputedStyle(container);
    const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    // offset dimensions stay stable when scrollbars appear. Both axes use one scale.
    const availableWidth = Math.max(1, container.offsetWidth - paddingX);
    const availableHeight = Math.max(1, container.offsetHeight - paddingY);
    const scale = Math.min(availableWidth / config.width, availableHeight / config.height, 1) * embeddedZoom;

    conceptCanvas.style.width = `${config.width * scale}px`;
    conceptCanvas.style.height = `${config.height * scale}px`;
    // Positive margins only: an oversized canvas must never start at a negative,
    // unreachable offset (flex centering clipped the top/left of earlier versions).
    conceptCanvas.style.marginLeft = `${Math.max(0, (container.clientWidth - paddingX - config.width * scale) / 2)}px`;
    if (anchor) {
      const rect = conceptCanvas.getBoundingClientRect(), viewport = container.getBoundingClientRect();
      container.scrollLeft += rect.left - viewport.left + anchor.u * rect.width - anchor.x;
      container.scrollTop += rect.top - viewport.top + anchor.v * rect.height - anchor.y;
    } else if (reset) {
      container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
      container.scrollTop = 0;
    }
  }

  for (let n = 1; n <= 18; n += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(n).padStart(2, '0');
    button.dataset.hole = n;
    if (!availableConcepts.has(n)) button.classList.add('pending-hole');
    button.addEventListener('click', () => selectHole(n));
    nav.appendChild(button);
  }

  Object.entries(buttons).forEach(([key, button]) => {
    button.addEventListener('click', () => selectMode(key));
  });
  annotationToggle.addEventListener('click', () => {
    annotationsVisible = !annotationsVisible;
    render();
  });
  exportAnnotated.addEventListener('click', exportAnnotatedPng);
  conceptImage.addEventListener('load', () => fitEmbeddedConcept());
  window.addEventListener('resize', () => requestAnimationFrame(() => fitEmbeddedConcept()));
  const canvasViewport = conceptCanvas.parentElement;
  let panGesture = null;
  canvasViewport.addEventListener('wheel', (event) => {
    if (!embedMode || deviceMode || !event.deltaY || dragState) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvasViewport.clientHeight : 1);
    // Zoom about the viewport centre, not the cursor over empty side margins.
    // The image stays centred; overflow remains reachable by dragging/scrollbars.
    const viewport = canvasViewport.getBoundingClientRect();
    const anchor = embeddedAnchor(viewport.left + canvasViewport.clientWidth / 2,
      viewport.top + canvasViewport.clientHeight / 2);
    // When viewing the top, keep it in view while enlarging. Once panned,
    // retain the current vertical viewing position instead.
    if (canvasViewport.scrollTop <= 0) {
      anchor.v = 0;
      anchor.y = parseFloat(getComputedStyle(canvasViewport).paddingTop) || 0;
    }
    setEmbeddedZoom(embeddedZoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * .0015),
      { anchor });
  }, { passive: false });
  canvasViewport.addEventListener('pointerdown', (event) => {
    if (!embedMode || deviceMode || event.button !== 0 || dragState || placementMode) return;
    // Ignore native scrollbar clicks. Annotation handles keep their own drag handler.
    const rect = canvasViewport.getBoundingClientRect();
    if (event.clientX - rect.left >= canvasViewport.clientWidth || event.clientY - rect.top >= canvasViewport.clientHeight) return;
    panGesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: canvasViewport.scrollLeft, top: canvasViewport.scrollTop };
    event.preventDefault();
    canvasViewport.setPointerCapture(event.pointerId);
    canvasViewport.classList.add('is-panning');
  });
  canvasViewport.addEventListener('pointermove', (event) => {
    if (!panGesture || panGesture.id !== event.pointerId) return;
    canvasViewport.scrollLeft = panGesture.left - (event.clientX - panGesture.x);
    canvasViewport.scrollTop = panGesture.top - (event.clientY - panGesture.y);
  });
  function finishPan() { panGesture = null; canvasViewport.classList.remove('is-panning'); }
  canvasViewport.addEventListener('pointerup', finishPan);
  canvasViewport.addEventListener('pointercancel', finishPan);
  canvasViewport.addEventListener('lostpointercapture', finishPan);

  async function exportAnnotatedPng() {
    if (!availableConcepts.has(hole)) return;
    const viewBox = annotationOverlay.viewBox.baseVal;
    const targetHeight = 4096;
    const scale = targetHeight / viewBox.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewBox.width * scale);
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(conceptImage, 0, 0, canvas.width, canvas.height);

    if (annotationsVisible) {
      const svgCopy = annotationOverlay.cloneNode(true);
      svgCopy.classList.remove('hidden');
      svgCopy.removeAttribute('hidden');
      svgCopy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgCopy.setAttribute('width', String(viewBox.width));
      svgCopy.setAttribute('height', String(viewBox.height));
      const exportStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      exportStyle.textContent = `
        text{fill:#f8fbf4;font-family:Arial,PingFang SC,sans-serif;font-size:15px;font-weight:800;letter-spacing:.03em}
        .map-title text{fill:#254021;font-size:13px;letter-spacing:.15em}.map-title .hole-title{font-size:24px;letter-spacing:.01em}.distance-row text{font-size:12px;letter-spacing:.01em}
        .callout path,.tee-label path{fill:none;stroke:#f9fbf4;stroke-width:2}.callout circle{fill:#355d38;stroke:#f9fbf4;stroke-width:2}.callout rect{fill:#183820;fill-opacity:.91;stroke:#f9fbf4;stroke-opacity:.8;stroke-width:1}.callout .zh{font-size:12px;font-weight:650;opacity:.88;letter-spacing:.02em}
        .tee-label rect{fill:#f3f0e6;fill-opacity:.93;stroke:#667861;stroke-width:1}.tee-label text{fill:#21391e;font-size:12px;letter-spacing:0}.tee-label circle{stroke:#fff;stroke-width:2}
        .centerline path{fill:none;stroke:#fffdf3;stroke-width:3;stroke-dasharray:12 12;stroke-linecap:round;opacity:.9}
        .distance-arcs path{fill:none;stroke:#f8fbf4;stroke-width:3;stroke-dasharray:10 10}.distance-arcs rect{fill:#f6f5ec;fill-opacity:.95;stroke:#839078;stroke-width:1}.distance-arcs text{fill:#274224;font-size:14px;letter-spacing:0}
      `;
      svgCopy.insertBefore(exportStyle, svgCopy.firstChild);
      const svgText = new XMLSerializer().serializeToString(svgCopy);
      const overlayImage = new Image();
      await new Promise((resolve, reject) => {
        overlayImage.onload = resolve;
        overlayImage.onerror = reject;
        overlayImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      });
      context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
    }

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png', 1);
    anchor.download = `taizhou-yunhai-hole-${String(hole).padStart(2, '0')}-annotated-4k.png`;
    anchor.click();
  }

  function selectHole(nextHole) {
    hole = nextHole;
    sourceImage.src = `assets/satellite-hd-h${hole}.jpg`;
    sourceImage.alt = `第 ${hole} 洞卫星增强基线`;
    const hasConcept = availableConcepts.has(hole);
    pending.hidden = hasConcept;
    conceptImage.hidden = !hasConcept;
    if (hasConcept) configureConcept(hole);
    else conceptImage.src = '';
    annotationOverlay.hidden = !hasConcept;
    if (!hasConcept && mode === 'concept') mode = 'source';
    statusCopy.textContent = hasConcept ? `第 ${hole} 洞 · 高清材质样板` : `第 ${hole} 洞 · 准确几何基线`;
    modeNote.textContent = hasConcept
      ? `第 ${hole} 洞高清材质版：坐标与边界仍以卫星增强基线为准，标识为独立矢量层。`
      : `第 ${hole} 洞已载入准确卫星增强基线；高清材质版按已确认风格继续制作。`;
    render();
    postToParent('ready', collectOverlayState());
    postToParent('calibration-ready', defaultOverlayCalibration);
  }

  function selectMode(nextMode) {
    if (nextMode === 'concept' && !availableConcepts.has(hole)) return;
    mode = nextMode;
    render();
  }

  function render() {
    [...nav.children].forEach((button) => button.classList.toggle('selected', Number(button.dataset.hole) === hole));
    Object.entries(buttons).forEach(([key, button]) => {
      const selected = key === mode;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    stage.classList.toggle('compare', mode === 'compare');
    sourceFrame.hidden = mode === 'concept';
    conceptFrame.hidden = mode === 'source';
    annotationOverlay.classList.toggle('hidden', !annotationsVisible || !availableConcepts.has(hole));
    annotationToggle.setAttribute('aria-pressed', String(annotationsVisible));
    annotationToggle.textContent = `标识：${annotationsVisible ? '开' : '关'}`;
    exportAnnotated.disabled = !availableConcepts.has(hole);
    const url = new URL(location.href);
    url.searchParams.set('hole', hole);
    url.searchParams.set('mode', mode);
    url.searchParams.set('labels', annotationsVisible ? 'on' : 'off');
    history.replaceState(null, '', url);
  }

  selectHole(hole);
  if (mode === 'concept' && !availableConcepts.has(hole)) mode = 'source';
  render();
})();
