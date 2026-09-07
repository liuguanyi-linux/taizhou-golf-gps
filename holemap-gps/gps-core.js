(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HoleGpsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EARTH = 6371008.8;

  function toLocal(point, origin) {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    const lat0 = Number(origin[1]) * Math.PI / 180;
    return {
      x: (lon - Number(origin[0])) * Math.PI / 180 * EARTH * Math.cos(lat0),
      y: (lat - Number(origin[1])) * Math.PI / 180 * EARTH,
    };
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function buildMetricLine(coords) {
    const origin = coords[0];
    const points = coords.map((p) => toLocal(p, origin));
    let total = 0;
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      total += distance(points[i - 1], points[i]);
      cumulative.push(total);
    }
    return { origin, points, cumulative, total };
  }

  function projectOnLine(coord, line) {
    const p = toLocal(coord, line.origin);
    let best = { distance: Infinity, along: 0, lateral: 0, segment: 0, t: 0 };
    for (let i = 0; i < line.points.length - 1; i += 1) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
      const q = { x: a.x + vx * t, y: a.y + vy * t };
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d < best.distance) {
        const cross = vx * (p.y - a.y) - vy * (p.x - a.x);
        best = {
          distance: d,
          along: line.cumulative[i] + Math.sqrt(len2) * t,
          lateral: Math.sign(cross || 1) * d,
          segment: i,
          t,
        };
      }
    }
    best.progress = line.total ? best.along / line.total : 0;
    return best;
  }

  function cubic(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
      x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
    };
  }

  function samplePixelRoute(segments, steps) {
    const points = [];
    segments.forEach((s, segmentIndex) => {
      for (let i = 0; i <= steps; i += 1) {
        if (segmentIndex && i === 0) continue;
        points.push(cubic(s[0], s[1], s[2], s[3], i / steps));
      }
    });
    let total = 0;
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      total += distance(points[i - 1], points[i]);
      cumulative.push(total);
    }
    return { points, cumulative, total };
  }

  function pointAtProgress(route, progress) {
    const target = Math.max(0, Math.min(1, progress)) * route.total;
    let i = 1;
    while (i < route.cumulative.length && route.cumulative[i] < target) i += 1;
    i = Math.min(i, route.points.length - 1);
    const a = route.points[i - 1];
    const b = route.points[i];
    const span = route.cumulative[i] - route.cumulative[i - 1] || 1;
    const t = (target - route.cumulative[i - 1]) / span;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { point, normal: { x: -(b.y - a.y) / len, y: (b.x - a.x) / len } };
  }

  function createMapper(centerline, pixelSegments, lateralScale, calibrationAnchors) {
    const geoLine = buildMetricLine(centerline);
    const pixelRoute = samplePixelRoute(pixelSegments, 50);
    const pxPerMeter = pixelRoute.total / geoLine.total;
    const rawMap = (coord) => {
      const projected = projectOnLine(coord, geoLine);
      const target = pointAtProgress(pixelRoute, projected.progress);
      const lateralPx = projected.lateral * pxPerMeter * (lateralScale || 0.72);
      return {
        x: target.point.x + target.normal.x * lateralPx,
        y: target.point.y + target.normal.y * lateralPx,
        ...projected,
      };
    };
    const anchors = (calibrationAnchors || []).map((anchor) => {
      const baseline = rawMap(anchor.geo);
      return {
        ...anchor,
        local: toLocal(anchor.geo, geoLine.origin),
        dx: anchor.pixel.x - baseline.x,
        dy: anchor.pixel.y - baseline.y,
      };
    });
    return {
      geoLine,
      pixelRoute,
      map(coord) {
        const mapped = rawMap(coord);
        if (!anchors.length) return mapped;
        const p = toLocal(coord, geoLine.origin);
        let weightTotal = 0;
        let correctionX = 0;
        let correctionY = 0;
        for (const anchor of anchors) {
          const d = Math.hypot(p.x - anchor.local.x, p.y - anchor.local.y);
          if (d < 0.05) return { ...mapped, x: anchor.pixel.x, y: anchor.pixel.y };
          const weight = 1 / ((d + 2) ** 2);
          weightTotal += weight;
          correctionX += anchor.dx * weight;
          correctionY += anchor.dy * weight;
        }
        return {
          ...mapped,
          x: mapped.x + correctionX / weightTotal,
          y: mapped.y + correctionY / weightTotal,
        };
      },
    };
  }

  function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    const x = point[0];
    const y = point[1];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const xi = ring[i][0]; const yi = ring[i][1];
      const xj = ring[j][0]; const yj = ring[j][1];
      const crosses = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function rings(value) {
    if (!Array.isArray(value) || !value.length) return [];
    if (typeof value[0]?.[0] === 'number') return [value];
    return value.filter((ring) => Array.isArray(ring) && ring.length);
  }

  function inAny(point, value) {
    return rings(value).some((ring) => pointInRing(point, ring));
  }

  function distanceToPolylineMeters(point, line) {
    if (!Array.isArray(line) || line.length < 2) return Infinity;
    return projectOnLine(point, buildMetricLine(line)).distance;
  }

  function distanceToGeometryMeters(point, value, closed) {
    const candidates = rings(value);
    let best = Infinity;
    candidates.forEach((coords) => {
      if (!Array.isArray(coords) || coords.length < 2) return;
      const line = closed && coords.length > 2 ? [...coords, coords[0]] : coords;
      best = Math.min(best, distanceToPolylineMeters(point, line));
    });
    return best;
  }

  function classify(point, hole) {
    const priorityTests = [
      ['果岭', hole.green],
      ['发球区', hole.teebox],
      ['沙坑', hole.bunkers],
      ['水域', hole.water],
    ];
    for (const [label, geometry] of priorityTests) {
      if (inAny(point, geometry)) return label;
    }
    const cartpaths = [
      ...(Array.isArray(hole.cartpaths) ? hole.cartpaths : []),
      ...(Array.isArray(hole.cart_route) && typeof hole.cart_route[0]?.[0] === 'number' ? [hole.cart_route] : []),
    ];
    if (cartpaths.some((line) => distanceToPolylineMeters(point, line) <= 4.5)) return '球车道';
    const areaTests = [
      ['果岭裙', hole.fringe],
      ['球道', hole.fairways?.length ? hole.fairways : hole.fairway],
    ];
    for (const [label, geometry] of areaTests) {
      if (inAny(point, geometry)) return label;
    }
    if (inAny(point, hole.rough)) return '长草区';
    if (inAny(point, hole.holeperim)) return '球洞范围';
    return '范围外';
  }

  function haversine(a, b) {
    const p1 = a[1] * Math.PI / 180;
    const p2 = b[1] * Math.PI / 180;
    const dp = (b[1] - a[1]) * Math.PI / 180;
    const dl = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * EARTH * Math.asin(Math.sqrt(h));
  }

  function teeToGreenLine(hole) {
    const source = Array.isArray(hole?.centerline) ? hole.centerline.filter((point) => Array.isArray(point) && point.length >= 2).map((point) => [...point]) : [];
    const tee = hole?.tees?.black || hole?.tee;
    const flag = hole?.flag || hole?.pins?.mid;
    if (!source.length) return [tee, flag].filter(Boolean);
    if (source.length === 1) return [tee, source[0], flag].filter(Boolean);
    if (tee && flag) {
      const forward = haversine(source[0], tee) + haversine(source[source.length - 1], flag);
      const reverse = haversine(source[source.length - 1], tee) + haversine(source[0], flag);
      if (reverse < forward) source.reverse();
    } else if (tee && haversine(source[source.length - 1], tee) < haversine(source[0], tee)) {
      source.reverse();
    }
    if (tee && haversine(source[0], tee) > 0.5) source.unshift([...tee]);
    if (flag && haversine(source[source.length - 1], flag) > 0.5) source.push([...flag]);
    return source;
  }

  function cartSimulationRoute(hole) {
    const source = Array.isArray(hole?.cart_route)
      ? hole.cart_route.filter((point) => Array.isArray(point) && point.length >= 2).map((point) => [...point])
      : [];
    if (source.length < 2) return [];
    const tee = hole?.tees?.black || hole?.tee;
    const flag = hole?.flag || hole?.pins?.mid;
    if (tee && flag) {
      const forward = haversine(source[0], tee) + haversine(source[source.length - 1], flag);
      const reverse = haversine(source[source.length - 1], tee) + haversine(source[0], flag);
      if (reverse < forward) source.reverse();
    } else if (tee && haversine(source[source.length - 1], tee) < haversine(source[0], tee)) {
      source.reverse();
    }
    return source;
  }

  // 把球车投影到实际行驶路线，得出“沿路线到果岭”的剩余里程；
  // 末端到旗杆的短收尾段也单独保留，避免伪造一条穿越球场的路线。
  function cartRouteMetrics(point, hole) {
    const routePoints = cartSimulationRoute(hole);
    if (!Array.isArray(point) || routePoints.length < 2) return null;
    const route = buildMetricLine(routePoints);
    const projection = projectOnLine(point, route);
    const flag = hole?.flag || hole?.pins?.mid || null;
    const endpointToFlag = flag ? haversine(routePoints[routePoints.length - 1], flag) : 0;
    return {
      route,
      projection,
      total: route.total,
      remaining_on_route: Math.max(0, route.total - projection.along),
      endpoint_to_flag: endpointToFlag,
      remaining_to_flag: Math.max(0, route.total - projection.along) + endpointToFlag,
    };
  }

  function greenTargets(hole) {
    if (hole.green_targets?.front && hole.green_targets?.middle && hole.green_targets?.back) return hole.green_targets;
    const ring = rings(hole.green)[0] || [];
    if (!ring.length) return { front: hole.flag, middle: hole.flag, back: hole.flag };
    const tee = hole.tees?.black || hole.tee || hole.centerline?.[0] || ring[0];
    const ordered = ring.map((point) => ({ point, distance: haversine(tee, point) })).sort((a, b) => a.distance - b.distance);
    const middle = ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
    return {
      front: ordered[0].point,
      middle: [middle[0] / ring.length, middle[1] / ring.length],
      back: ordered[ordered.length - 1].point,
    };
  }

  function findHole(point, holes, preferredHoleNumber) {
    const candidates = holes || [];
    const preferred = candidates.find((hole) => Number(hole.n ?? hole.hole ?? hole.number) === Number(preferredHoleNumber));
    if (preferred && inAny(point, preferred.holeperim)) {
      const distance = distanceToPolylineMeters(point, preferred.centerline);
      return { hole: preferred, distance, inside: true, retained: true };
    }

    const containing = candidates.filter((hole) => inAny(point, hole.holeperim));
    const pool = containing.length ? containing : candidates;
    let best = null;
    pool.forEach((hole) => {
      if (!Array.isArray(hole.centerline) || hole.centerline.length < 2) return;
      const distance = distanceToPolylineMeters(point, hole.centerline);
      if (!best || distance < best.distance) {
        best = { hole, distance, inside: containing.length > 0, retained: false };
      }
    });
    return best;
  }

  function deviceMetrics(point, hole) {
    const targets = greenTargets(hole);
    const distanceTo = (target) => target ? haversine(point, target) : null;
    return {
      zone: classify(point, hole),
      flag: distanceTo(hole.flag),
      green_front: distanceTo(targets.front),
      green_middle: distanceTo(targets.middle),
      green_back: distanceTo(targets.back),
      bunker_nearest: distanceToGeometryMeters(point, hole.bunkers, true),
      water_nearest: distanceToGeometryMeters(point, hole.water, true),
      cart_path_nearest: distanceToGeometryMeters(point, [
        ...(Array.isArray(hole.cartpaths) ? hole.cartpaths : []),
        ...(Array.isArray(hole.cart_route) && typeof hole.cart_route[0]?.[0] === 'number' ? [hole.cart_route] : []),
      ], false),
      centerline: Array.isArray(hole.centerline) && hole.centerline.length > 1
        ? projectOnLine(point, buildMetricLine(hole.centerline))
        : null,
      cart_route: cartRouteMetrics(point, hole),
    };
  }

  return { buildMetricLine, projectOnLine, createMapper, classify, haversine, teeToGreenLine, cartSimulationRoute, cartRouteMetrics, pointInRing, rings, distanceToPolylineMeters, distanceToGeometryMeters, greenTargets, findHole, deviceMetrics };
});
