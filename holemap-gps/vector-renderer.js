(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HoleVectorRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const EARTH = 6371008.8;

  function node(tag, attributes = {}, text = '') {
    const result = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => result.setAttribute(key, value));
    if (text) result.textContent = text;
    return result;
  }

  function rings(value) {
    if (!Array.isArray(value) || !value.length) return [];
    if (typeof value[0]?.[0] === 'number') return [value];
    return value.filter((ring) => Array.isArray(ring) && ring.length && typeof ring[0]?.[0] === 'number');
  }

  function createProjection(hole) {
    const perimeter = rings(hole.holeperim)[0];
    if (!perimeter || perimeter.length < 3) throw new Error(`第 ${hole.n} 洞缺少有效球洞边界`);
    const origin = perimeter[0];
    const lat0 = perimeter.reduce((sum, point) => sum + Number(point[1]), 0) / perimeter.length * Math.PI / 180;
    const rawLocal = (point) => ({
      x: (Number(point[0]) - Number(origin[0])) * Math.PI / 180 * EARTH * Math.cos(lat0),
      y: (Number(point[1]) - Number(origin[1])) * Math.PI / 180 * EARTH,
    });
    const teeRaw = rawLocal(hole.tees?.black || hole.tee || hole.centerline?.[0] || perimeter[0]);
    const flagRaw = rawLocal(hole.flag || hole.centerline?.[hole.centerline.length - 1] || perimeter[perimeter.length - 1]);
    const direction = Math.atan2(flagRaw.y - teeRaw.y, flagRaw.x - teeRaw.x);
    const rotation = Math.PI / 2 - direction;
    const cosine = Math.cos(rotation); const sine = Math.sin(rotation);
    const local = (point) => {
      const raw = rawLocal(point);
      return { x: raw.x * cosine - raw.y * sine, y: raw.x * sine + raw.y * cosine };
    };
    const localPerimeter = perimeter.map(local);
    const xs = localPerimeter.map((point) => point.x);
    const ys = localPerimeter.map((point) => point.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const metricWidth = Math.max(1, maxX - minX);
    const metricHeight = Math.max(1, maxY - minY);
    const aspect = metricWidth / metricHeight;
    const longSide = 1400;
    const shortFloor = 760;
    const width = Math.round(aspect >= 1 ? longSide : Math.max(shortFloor, longSide * aspect));
    const height = Math.round(aspect >= 1 ? Math.max(shortFloor, longSide / aspect) : longSide);
    const padding = Math.max(62, Math.min(width, height) * 0.09);
    const scale = Math.min((width - padding * 2) / metricWidth, (height - padding * 2) / metricHeight);
    const drawWidth = metricWidth * scale;
    const drawHeight = metricHeight * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    const map = (point) => {
      const p = local(point);
      return {
        x: offsetX + (p.x - minX) * scale,
        y: offsetY + (maxY - p.y) * scale,
      };
    };
    return { width, height, padding, scale, map, local, perimeter, rotation };
  }

  function pathForRing(ring, projection, close = true) {
    if (!ring?.length) return '';
    const points = ring.map(projection.map);
    return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ') + (close ? ' Z' : '');
  }

  function appendPolygonLayer(parent, value, projection, className, featureType) {
    const values = rings(value);
    values.forEach((ring, index) => {
      parent.append(node('path', {
        d: pathForRing(ring, projection),
        class: `course-feature ${className}`,
        'data-feature': featureType,
        'data-index': index,
      }));
    });
    return values.length;
  }

  function appendLineLayer(parent, values, projection, className, featureType) {
    let count = 0;
    (values || []).forEach((line, index) => {
      if (!Array.isArray(line) || line.length < 2 || typeof line[0]?.[0] !== 'number') return;
      parent.append(node('path', {
        d: pathForRing(line, projection, false),
        class: `course-feature ${className}`,
        'data-feature': featureType,
        'data-index': index,
      }));
      count += 1;
    });
    return count;
  }

  function renderTrees(parent, trees, projection) {
    const radius = Math.max(10, Math.min(23, projection.scale * 4.2));
    (trees || []).forEach((coord, index) => {
      if (!Array.isArray(coord) || typeof coord[0] !== 'number') return;
      const p = projection.map(coord);
      const group = node('g', {
        class: 'course-feature feature-tree',
        transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`,
        'data-feature': 'tree',
        'data-index': index,
      });
      group.append(node('circle', { cx: -radius * .33, cy: radius * .04, r: radius * .62, class: 'tree-crown tree-back' }));
      group.append(node('circle', { cx: radius * .34, cy: radius * .08, r: radius * .66, class: 'tree-crown tree-mid' }));
      group.append(node('circle', { cx: 0, cy: -radius * .34, r: radius * .72, class: 'tree-crown tree-front' }));
      group.append(node('circle', { r: radius * .18, class: 'tree-core' }));
      parent.append(group);
    });
    return (trees || []).length;
  }

  function renderBridges(parent, bridges, projection) {
    let count = 0;
    (bridges || []).forEach((bridge, index) => {
      if (!Array.isArray(bridge) || !bridge.length) return;
      const line = typeof bridge[0]?.[0] === 'number' ? bridge : bridge[0];
      if (!Array.isArray(line) || line.length < 2) return;
      parent.append(node('path', {
        d: pathForRing(line, projection, false),
        class: 'course-feature feature-bridge-casing',
        'data-feature': 'bridge',
        'data-index': index,
      }));
      parent.append(node('path', {
        d: pathForRing(line, projection, false),
        class: 'course-feature feature-bridge',
        'data-feature': 'bridge',
        'data-index': index,
      }));
      count += 1;
    });
    return count;
  }

  function render(svg, hole) {
    const projection = createProjection(hole);
    svg.setAttribute('viewBox', `0 0 ${projection.width} ${projection.height}`);
    const paper = svg.querySelector('#mapPaper');
    paper.setAttribute('width', projection.width);
    paper.setAttribute('height', projection.height);
    const clipPath = svg.querySelector('#holeClipPath');
    clipPath.setAttribute('d', pathForRing(projection.perimeter, projection));
    const parent = svg.querySelector('#courseLayers');
    parent.replaceChildren();

    const shadowGroup = node('g', { class: 'course-shadow', filter: 'url(#courseShadow)' });
    parent.append(shadowGroup);
    const counts = {};
    counts.hole_perimeter = appendPolygonLayer(shadowGroup, hole.holeperim, projection, 'feature-perimeter', 'hole_perimeter');

    const clipped = node('g', { 'clip-path': 'url(#holeClip)', class: 'course-clipped-layers' });
    shadowGroup.append(clipped);
    counts.rough = appendPolygonLayer(clipped, hole.rough?.length ? hole.rough : hole.holeperim, projection, 'feature-rough', 'rough');
    counts.water = appendPolygonLayer(clipped, hole.water, projection, 'feature-water', 'water');
    counts.fairway = appendPolygonLayer(clipped, hole.fairways?.length ? hole.fairways : hole.fairway, projection, 'feature-fairway', 'fairway');
    counts.tee_box = appendPolygonLayer(clipped, hole.teebox, projection, 'feature-tee-box', 'tee_box');
    counts.fringe = appendPolygonLayer(clipped, hole.fringe, projection, 'feature-fringe', 'green_fringe');
    counts.green = appendPolygonLayer(clipped, hole.green, projection, 'feature-green', 'green');
    counts.bunker = appendPolygonLayer(clipped, hole.bunkers, projection, 'feature-bunker', 'bunker');
    counts.cart_path = appendLineLayer(clipped, hole.cartpaths, projection, 'feature-cart-casing', 'cart_path');
    appendLineLayer(clipped, hole.cartpaths, projection, 'feature-cart-path', 'cart_path');
    counts.bridge = renderBridges(clipped, hole.bridges, projection);
    counts.tree = renderTrees(clipped, hole.trees, projection);

    parent.append(node('path', {
      d: pathForRing(projection.perimeter, projection),
      class: 'course-feature feature-perimeter-outline',
      'data-feature': 'hole_perimeter',
    }));
    return { projection, counts };
  }

  return { createProjection, pathForRing, render, rings };
});
