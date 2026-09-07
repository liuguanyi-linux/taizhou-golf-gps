/* WGS84 point catalogue and exchange helpers. No storage writes, GPS watch, or network I/O. */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./gps-core.js') : root.HoleGpsCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HolePointWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GpsCore) {
  'use strict';
  const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const RAD = Math.PI / 180;
  const DISTANCE_TYPE = 'surface_geodesic_not_route';

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !NUMBER.test(value.trim())) return null;
    const result = Number(value.trim());
    return Number.isFinite(result) ? result : null;
  }

  function coordinate(value) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lng = number(value[0]), lat = number(value[1]);
    return lng !== null && lat !== null && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
      ? [lng, lat] : null;
  }

  function issue(code, field, message, extra) {
    return { code, field, message, ...(extra || {}) };
  }

  function timestamp(value) {
    if (value == null || value === '') return { value: null, valid: true };
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
      return { value: null, valid: false };
    }
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const millis = Date.parse(value);
    if (month < 1 || month > 12 || day < 1 || day > maxDay || !Number.isFinite(millis)) return { value: null, valid: false };
    return { value: new Date(millis).toISOString(), valid: true };
  }

  function normalizePoint(input, options) {
    options = options || {};
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { point: null, errors: [issue('invalid_point', 'point', '点位必须是对象')] };
    }
    const rawId = input.id ?? options.id;
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId).trim() : '';
    if (!id) errors.push(issue('missing_id', 'id', '每个点需要非空且稳定的 ID'));
    const coord = coordinate(input.coordinate);
    if (!coord) errors.push(issue('invalid_coordinate', 'coordinate', '坐标必须为 [经度, 纬度]，不能空白或超出 WGS84 范围'));
    const kind = input.kind || 'reference';
    if (kind !== 'reference' && kind !== 'cart') errors.push(issue('invalid_kind', 'kind', '点类型必须是 reference 或 cart'));
    const rawAccuracy = input.accuracy_m;
    const accuracy = rawAccuracy == null || rawAccuracy === '' ? null : number(rawAccuracy);
    if (rawAccuracy != null && rawAccuracy !== '' && (accuracy === null || accuracy < 0)) {
      errors.push(issue('invalid_accuracy', 'accuracy_m', '精度必须为非负米数，未知精度应留空'));
    }
    const updated = timestamp(input.updated_at ?? input.timestamp);
    if (!updated.valid) errors.push(issue('invalid_timestamp', 'updated_at', '时间应是包含时区的 ISO 8601 时间'));
    let pixel = null;
    if (input.pixel != null) {
      const x = number(input.pixel.x), y = number(input.pixel.y);
      if (x === null || y === null) errors.push(issue('invalid_pixel', 'pixel', '图片位置 x、y 必须为有效数字'));
      else pixel = { x, y };
    }
    const rawHole = input.hole ?? options.hole;
    const hole = rawHole == null ? null : number(rawHole);
    if (rawHole != null && (!Number.isInteger(hole) || hole < 1)) errors.push(issue('invalid_hole', 'hole', '球洞编号必须为正整数'));
    if (errors.length) return { point: null, errors };
    return {
      point: {
        id,
        name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : id,
        kind,
        coordinate: coord,
        hole,
        source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'unknown',
        accuracy_m: accuracy,
        updated_at: updated.value,
        pixel,
        registration_version: input.registration_version ?? null,
        registration_quality: input.registration_quality ?? 'unverified',
      },
      errors,
    };
  }

  function validRings(value) {
    if (!Array.isArray(value) || !value.length) return [];
    const source = Array.isArray(value[0]) && !Array.isArray(value[0][0]) ? [value] : value;
    return source.filter(ring => Array.isArray(ring) && ring.length >= 3 && ring.every(point => coordinate(point)))
      .map(ring => ring.map(point => coordinate(point)));
  }

  function rangeStatus(value, hole) {
    const coord = coordinate(value);
    const rings = validRings(hole?.holeperim);
    if (!coord || !rings.length) return 'unknown';
    for (const ring of rings) {
      const closed = [...ring, ring[0]];
      if (GpsCore?.distanceToPolylineMeters?.(coord, closed) <= 0.02) return 'boundary';
      if (GpsCore?.pointInRing?.(coord, ring)) return 'inside';
    }
    return 'outside';
  }

  function stableId(courseId, holeNumber, type, localId) {
    return [courseId, 'hole', holeNumber, type, localId].map(part => encodeURIComponent(String(part))).join('/');
  }

  function buildCatalog(course, options) {
    options = options || {};
    const courseId = options.courseId || course?.slug || 'course';
    const points = [], errors = [], seen = new Set();
    for (const hole of course?.holes || []) {
      const n = number(hole.n ?? hole.hole);
      if (!Number.isInteger(n) || n < 1) {
        errors.push(issue('invalid_hole', 'hole', '跳过编号无效的球洞'));
        continue;
      }
      const registration = options.registrations?.[n] ?? hole.registration;
      const quality = registration?.quality ?? registration?.status ?? hole.registration_quality ?? 'unverified';
      const version = registration?.version ?? hole.registration_version ?? null;
      function add(localId, type, name, rawCoord, metadata) {
        const coord = coordinate(rawCoord);
        const id = stableId(courseId, n, type, localId);
        if (!coord) {
          errors.push(issue('invalid_coordinate', 'coordinate', '点位坐标无效，未加入目录', { id, hole: n }));
          return;
        }
        if (seen.has(id)) {
          errors.push(issue('duplicate_id', 'id', '同一球洞的点位 ID 重复，不能稳定引用', { id, hole: n }));
          return;
        }
        seen.add(id);
        const props = metadata || {};
        const parsedAccuracy = number(props.accuracy_m);
        points.push({
          id, local_id: String(localId), course_id: courseId, hole: n, name, type,
          kind: props.kind || type, coordinate: coord,
          source: props.source || 'existing_course_data',
          accuracy_m: parsedAccuracy !== null && parsedAccuracy >= 0 ? parsedAccuracy : null,
          updated_at: props.updated_at ?? null,
          registration_quality: props.registration_quality ?? quality,
          registration_version: props.registration_version ?? version,
          pixel: props.pixel ?? null,
          range_status: rangeStatus(coord, hole),
          ...(props.role ? { role: props.role } : {}),
          ...(props.color ? { color: props.color } : {}),
        });
      }
      for (const [color, coord] of Object.entries(hole.tees || {})) {
        add(color, 'tee', color + ' Tee', coord, { color });
      }
      if (!Object.keys(hole.tees || {}).length && hole.tee) add('default', 'tee', '发球点', hole.tee);
      if (hole.flag || hole.pins?.mid) add('flag', 'green', '果岭旗杆', hole.flag || hole.pins.mid, { role: 'flag' });
      const greenTargets = hole.green_targets || GpsCore?.greenTargets?.(hole) || {};
      for (const role of ['front', 'middle', 'back']) {
        if (greenTargets[role]) add(role, 'green', { front: '果岭前缘', middle: '果岭中心', back: '果岭后缘' }[role],
          greenTargets[role], { role, source: hole.green_targets?.[role] ? 'existing_course_data' : 'derived_geometry' });
      }
      if (hole.cart_position) add('default', 'cart-position', '球车位置（模拟）', hole.cart_position, {
        kind: 'cart', source: 'simulation', accuracy_m: null,
      });
      (hole.device_points || []).forEach((input, index) => {
        if (!input || typeof input !== 'object') {
          errors.push(issue('invalid_point', 'device_points', '点位记录无效', { hole: n, index }));
          return;
        }
        // Read old drafts without mutating them. A caller should persist IDs before
        // external integration; positional fallback IDs are explicitly diagnosed.
        const legacy = input.id == null || String(input.id).trim() === '';
        const normalized = normalizePoint(input, { id: 'legacy-' + index, hole: n });
        if (legacy) errors.push(issue('legacy_id', 'id', '旧点位缺少稳定 ID；请保存分配 ID 后再交付', { hole: n, index }));
        if (!normalized.point) {
          normalized.errors.forEach(error => errors.push({ ...error, hole: n, index }));
          return;
        }
        const point = normalized.point;
        add(point.id, 'device', point.name, point.coordinate, {
          ...point,
          registration_quality: input.registration_quality ?? quality,
          registration_version: input.registration_version ?? version,
        });
      });
    }
    return { course_id: courseId, points, errors };
  }

  // WGS84 inverse Vincenty: horizontal ellipsoid geodesic, not driving distance.
  // Near-antipodal non-convergence uses a labelled spherical fallback, never silently.
  function geodesic(a, b) {
    a = coordinate(a?.coordinate || a);
    b = coordinate(b?.coordinate || b);
    if (!a || !b) return { distance_m: null, method: null };
    if (a[0] === b[0] && a[1] === b[1]) return { distance_m: 0, method: 'WGS84-Vincenty' };
    const major = 6378137, flattening = 1 / 298.257223563, minor = (1 - flattening) * major;
    const L = ((b[0] - a[0] + 540) % 360 - 180) * RAD;
    const U1 = Math.atan((1 - flattening) * Math.tan(a[1] * RAD));
    const U2 = Math.atan((1 - flattening) * Math.tan(b[1] * RAD));
    const s1 = Math.sin(U1), c1 = Math.cos(U1), s2 = Math.sin(U2), c2 = Math.cos(U2);
    let lambda = L, sigma, sinSigma, cosSigma, cosSqAlpha, cos2SigmaM, converged = false;
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const sl = Math.sin(lambda), cl = Math.cos(lambda);
      sinSigma = Math.hypot(c2 * sl, c1 * s2 - s1 * c2 * cl);
      if (sinSigma === 0) return { distance_m: 0, method: 'WGS84-Vincenty' };
      cosSigma = s1 * s2 + c1 * c2 * cl;
      sigma = Math.atan2(sinSigma, cosSigma);
      const sinAlpha = c1 * c2 * sl / sinSigma;
      cosSqAlpha = Math.max(0, 1 - sinAlpha * sinAlpha);
      cos2SigmaM = cosSqAlpha < 1e-16 ? 0 : cosSigma - 2 * s1 * s2 / cosSqAlpha;
      const C = flattening / 16 * cosSqAlpha * (4 + flattening * (4 - 3 * cosSqAlpha));
      const next = L + (1 - C) * flattening * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
      if (Math.abs(next - lambda) < 1e-12) { converged = true; break; }
      lambda = next;
    }
    if (!converged) {
      const dLat = (b[1] - a[1]) * RAD, dLon = (b[0] - a[0]) * RAD;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
      return { distance_m: 6371008.8 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h)))), method: 'spherical-fallback' };
    }
    const uSq = cosSqAlpha * (major * major - minor * minor) / (minor * minor);
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const correction = B * sinSigma * (cos2SigmaM + B / 4 *
      (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - B / 6 * cos2SigmaM *
       (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
    return { distance_m: minor * A * (sigma - correction), method: 'WGS84-Vincenty' };
  }

  function distanceMeters(a, b) {
    return geodesic(a, b).distance_m ?? NaN;
  }

  function measure(origin, targets, options) {
    options = options || {};
    const results = [], errors = [];
    const coord = coordinate(origin?.coordinate || origin);
    if (!coord) errors.push(issue('invalid_origin', 'origin', '起点坐标无效'));
    else for (const target of targets || []) {
      const targetCoord = coordinate(target?.coordinate || target);
      if (!targetCoord) { errors.push(issue('invalid_target', 'target', '目标坐标无效', { id: target?.id ?? null })); continue; }
      const metric = geodesic(coord, targetCoord);
      const targetHole = options.course?.holes?.find(hole => Number(hole.n) === Number(target.hole));
      results.push({
        target_id: target.id ?? null, name: target.name ?? '', hole: target.hole ?? null,
        coordinate: targetCoord, ...metric,
        target_range_status: targetHole ? rangeStatus(targetCoord, targetHole) : (target.range_status || 'unknown'),
        source_accuracy_m: number(origin.accuracy_m),
        target_accuracy_m: number(target.accuracy_m),
      });
    }
    return { origin_id: origin?.id ?? null, origin_coordinate: coord, unit: 'm', distance_type: DISTANCE_TYPE, results, errors };
  }

  function exportGeoJSON(course, options) {
    options = options || {};
    const catalog = buildCatalog(course, options);
    const features = catalog.points.map(point => {
      const { coordinate: coord, ...properties } = point;
      return { type: 'Feature', id: point.id, properties: { ...properties, coordinate_system: 'WGS84 / EPSG:4326' },
        geometry: { type: 'Point', coordinates: coord } };
    });
    for (const hole of course?.holes || []) {
      const rings = validRings(hole.holeperim);
      if (!rings.length) {
        catalog.errors.push(issue('missing_boundary', 'holeperim', '缺少有效球洞边界，不能判断范围', { hole: hole.n }));
        continue;
      }
      rings.forEach((ring, index) => {
        const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring : [...ring, [...ring[0]]];
        const id = stableId(catalog.course_id, hole.n, 'boundary', index);
        features.push({ type: 'Feature', id,
          properties: { id, course_id: catalog.course_id, hole: hole.n, type: 'hole_boundary',
            name: '第 ' + hole.n + ' 洞范围', source: 'existing_course_data', accuracy_m: null,
            registration_quality: hole.registration_quality ?? 'unverified', coordinate_system: 'WGS84 / EPSG:4326' },
          geometry: { type: 'Polygon', coordinates: [closed] } });
      });
    }
    return {
      type: 'FeatureCollection',
      point_workspace_schema: '1.0',
      coordinate_system: 'WGS84 / EPSG:4326',
      coordinate_order: ['longitude', 'latitude'],
      distance_type: DISTANCE_TYPE,
      distance_unit: 'm',
      properties: { course_id: catalog.course_id, course_name: course?.name || '',
        accuracy_note: 'accuracy_m is reported measurement accuracy, not coordinate decimal precision; null means unknown.',
        registration_note: 'unverified registration must be field-calibrated before reliable physical deployment.' },
      features,
      validation_errors: catalog.errors,
    };
  }

  function csvRows(text) {
    const rows = [], errors = [];
    let row = [], value = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
        else if (char === '"') { quoted = false; closed = true; }
        else value += char;
      } else if (char === '"' && value === '' && !closed) quoted = true;
      else if (char === ',' || char === '\n' || char === '\r') {
        row.push(value); value = ''; closed = false;
        if (char !== ',') { rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i += 1; }
      } else if (closed && /\s/.test(char)) continue;
      else if (closed || char === '"') {
        errors.push(issue('invalid_csv', 'csv', 'CSV 引号格式错误', { row: rows.length + 1 }));
        break;
      } else value += char;
    }
    if (quoted) errors.push(issue('invalid_csv', 'csv', 'CSV 引号没有闭合', { row: rows.length + 1 }));
    if (row.length || value.length || closed) { row.push(value); rows.push(row); }
    return { rows: rows.filter(values => values.some(value => value.trim() !== '')), errors };
  }

  function parseTelemetry(text, format) {
    const errors = [], positions = [], seen = new Set();
    let entries = [];
    if (typeof text !== 'string') return { positions, errors: [issue('invalid_input', 'input', '导入内容必须为 JSON 或 CSV 文本')] };
    text = text.replace(/^\uFEFF/, '').trim();
    if (!text) return { positions, errors: [issue('empty_input', 'input', '没有可导入的数据')] };
    format = !format || format === 'auto' ? (/^[{[]/.test(text) ? 'json' : 'csv') : format;
    if (format === 'json') {
      try {
        const parsed = JSON.parse(text);
        entries = Array.isArray(parsed) ? parsed : parsed.positions;
        if (!Array.isArray(entries)) throw new Error('Expected an array');
      } catch (error) { return { positions, errors: [issue('invalid_json', 'input', 'JSON 必须为点位数组或 {positions: [...]}')] }; }
    } else if (format === 'csv') {
      const parsed = csvRows(text);
      if (parsed.errors.length) return { positions, errors: parsed.errors };
      const header = parsed.rows.shift()?.map(field => field.trim().toLowerCase()) || [];
      const idColumn = header.indexOf('id');
      const lngColumn = header.findIndex(field => ['longitude', 'lng', 'lon'].includes(field));
      const latColumn = header.findIndex(field => ['latitude', 'lat'].includes(field));
      if (idColumn < 0 || lngColumn < 0 || latColumn < 0 || new Set(header).size !== header.length) {
        return { positions, errors: [issue('invalid_header', 'csv', 'CSV 需要不重复的 id, longitude, latitude 列')] };
      }
      parsed.rows.forEach((row, index) => {
        if (row.length !== header.length) { errors.push(issue('invalid_columns', 'csv', 'CSV 列数不一致', { row: index + 2 })); return; }
        const record = Object.fromEntries(header.map((key, column) => [key, row[column]]));
        entries.push({ ...record, coordinate: [row[lngColumn], row[latColumn]], __row: index + 2 });
      });
    } else return { positions, errors: [issue('invalid_format', 'format', '只支持 json 或 csv')] };
    entries.forEach((entry, index) => {
      const row = entry?.__row ?? index + 1;
      const normalized = normalizePoint(entry && typeof entry === 'object'
        ? { ...entry, kind: 'cart', source: 'gps_import' } : entry);
      if (!normalized.point) { normalized.errors.forEach(error => errors.push({ ...error, row })); return; }
      const point = normalized.point;
      if (seen.has(point.id)) { errors.push(issue('duplicate_id', 'id', '一次位置快照内同一车辆 ID 只能出现一次', { row, id: point.id })); return; }
      seen.add(point.id);
      positions.push({
        id: point.id, name: point.name, coordinate: point.coordinate, kind: 'cart', source: 'gps_import',
        hole: point.hole, timestamp: point.updated_at, updated_at: point.updated_at, accuracy_m: point.accuracy_m,
      });
    });
    return { positions, errors };
  }

  return {
    coordinate, normalizePoint, createPoint: normalizePoint, stableId, rangeStatus, buildCatalog,
    geodesic, distanceMeters, measure, exportGeoJSON, parseTelemetry,
  };
});
