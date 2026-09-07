(function (root, factory) {
  const api = factory(root.HoleGpsCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HoleGeoJson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GpsCore) {
  const POLYGONS = [
    ['holeperim', 'hole_perimeter'],
    ['rough', 'rough'],
    ['teebox', 'tee_box'],
    ['fairways', 'fairway'],
    ['fringe', 'green_fringe'],
    ['green', 'green'],
    ['bunkers', 'bunker'],
    ['water', 'water'],
    ['bridges', 'bridge'],
  ];
  const LINES = [
    ['centerline', 'centerline'],
    ['cart_route', 'cart_drive_route'],
    ['cartpaths', 'cart_path'],
    ['paths', 'path'],
    ['creeks', 'creek'],
    ['ditches', 'ditch'],
    ['obs', 'out_of_bounds'],
    ['fences', 'fence'],
    ['hazards', 'penalty_area_red'],
    ['hazards_y', 'penalty_area_yellow'],
  ];

  function closeRing(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  }

  function rings(value) {
    if (GpsCore?.rings) return GpsCore.rings(value);
    if (!Array.isArray(value) || !value.length) return [];
    return typeof value[0]?.[0] === 'number' ? [value] : value;
  }

  function lines(value) {
    if (!Array.isArray(value) || !value.length) return [];
    if (typeof value[0]?.[0] === 'number') return [value];
    return value.filter((line) => Array.isArray(line) && line.length >= 2);
  }

  function averagePoint(points) {
    if (!Array.isArray(points) || !points.length) return null;
    const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
  }

  function derivedGreenTargets(hole) {
    if (hole.green_targets?.front && hole.green_targets?.middle && hole.green_targets?.back) {
      return hole.green_targets;
    }
    const ring = rings(hole.green)[0] || [];
    if (!ring.length) return { front: hole.flag, middle: hole.flag, back: hole.flag };
    const tee = hole.tees?.black || hole.tee || hole.centerline?.[0] || ring[0];
    const distance = GpsCore?.haversine || ((a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]));
    const ordered = ring.map((point) => ({ point, distance: distance(tee, point) }))
      .sort((a, b) => a.distance - b.distance);
    return {
      front: [...ordered[0].point],
      middle: averagePoint(ring) || hole.flag,
      back: [...ordered[ordered.length - 1].point],
    };
  }

  function feature(courseId, holeNumber, featureType, geometry, properties = {}, index = 0) {
    const suffix = properties.color || properties.role || index;
    return {
      type: 'Feature',
      id: `${courseId}-h${String(holeNumber).padStart(2, '0')}-${featureType}-${suffix}`,
      properties: {
        course_id: courseId,
        hole: holeNumber,
        feature_type: featureType,
        ...properties,
      },
      geometry,
    };
  }

  function holeFeatures(hole, courseId = 'course') {
    const out = [];
    POLYGONS.forEach(([key, type]) => {
      let value = hole[key];
      if (key === 'fairways' && (!value || !value.length)) value = hole.fairway;
      rings(value).forEach((ring, index) => {
        if (ring.length >= 3) out.push(feature(courseId, hole.n, type, { type: 'Polygon', coordinates: [closeRing(ring)] }, { index }, index));
      });
    });
    LINES.forEach(([key, type]) => {
      lines(hole[key]).forEach((line, index) => {
        if (line.length >= 2) out.push(feature(courseId, hole.n, type, { type: 'LineString', coordinates: line }, { index }, index));
      });
    });
    (hole.trees || []).forEach((coordinates, index) => {
      out.push(feature(courseId, hole.n, 'tree', { type: 'Point', coordinates }, { index }, index));
    });
    Object.entries(hole.tees || {}).forEach(([color, coordinates], index) => {
      out.push(feature(courseId, hole.n, 'tee', { type: 'Point', coordinates }, {
        color,
        distance_m: hole.dist?.[color] ?? null,
      }, index));
    });
    if (hole.flag) out.push(feature(courseId, hole.n, 'flag', { type: 'Point', coordinates: hole.flag }, { role: 'daily_pin' }));
    if (Array.isArray(hole.cart_position) && hole.cart_position.length >= 2) {
      out.push(feature(courseId, hole.n, 'cart_position_simulation', { type: 'Point', coordinates: hole.cart_position }, {
        name: '球车位置（模拟）',
        device_use: true,
        distance_mode: 'route_remaining_to_green',
      }));
    }
    const greenTargets = derivedGreenTargets(hole);
    Object.entries(greenTargets).forEach(([role, coordinates]) => {
      if (coordinates) out.push(feature(courseId, hole.n, 'green_target', { type: 'Point', coordinates }, { role }));
    });
    Object.entries(hole.virtual_feature_points || {}).forEach(([anchorId, coordinates], index) => {
      out.push(feature(courseId, hole.n, 'visual_anchor', { type: 'Point', coordinates }, { anchor_id: anchorId, device_use: false }, index));
    });
    (hole.device_points || []).forEach((point, index) => {
      if (!Array.isArray(point?.coordinate) || point.coordinate.length < 2) return;
      out.push(feature(courseId, hole.n, 'device_reference_point', { type: 'Point', coordinates: point.coordinate }, {
        point_id: point.id || `point-${index}`,
        name: point.name || `GPS 参考点 ${index + 1}`,
        kind: point.kind || 'reference',
        device_use: true,
      }, point.id || index));
    });
    return out;
  }

  function collectionForHole(hole, courseId = 'course', courseName = '') {
    return {
      type: 'FeatureCollection',
      name: `${courseId}-hole-${String(hole.n).padStart(2, '0')}`,
      coordinate_system: 'WGS84 / EPSG:4326',
      device_schema_version: 2,
      properties: { course_id: courseId, course_name: courseName, hole: hole.n },
      features: holeFeatures(hole, courseId),
    };
  }

  function collectionForCourse(course, courseId = 'course') {
    const features = (course.holes || []).flatMap((hole) => holeFeatures(hole, courseId));
    if (Array.isArray(course.cart_route) && course.cart_route.length >= 2) {
      features.push(feature(courseId, 0, 'course_cart_route', { type: 'LineString', coordinates: course.cart_route }, { scope: 'course' }));
    }
    return {
      type: 'FeatureCollection',
      name: `${courseId}-device-data`,
      coordinate_system: 'WGS84 / EPSG:4326',
      device_schema_version: 2,
      generated_at: new Date().toISOString(),
      properties: { course_id: courseId, course_name: course.name || '', holes: (course.holes || []).length },
      features,
    };
  }

  return { POLYGONS, LINES, closeRing, rings, lines, derivedGreenTargets, holeFeatures, collectionForHole, collectionForCourse };
});
