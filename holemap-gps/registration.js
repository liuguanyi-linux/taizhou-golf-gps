/* WGS84 / image registration. Residuals measure fit consistency, not survey accuracy. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoleRegistration = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const isPixel = point => !!point && finite(point.x) && finite(point.y);
  const isWgs84 = coord => Array.isArray(coord) && coord.length >= 2 && finite(coord[0]) && finite(coord[1]) && Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  function convexHull(points) {
    const sorted = points.filter(isPixel).map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    const unique = sorted.filter((p, i) => !i || p.x !== sorted[i - 1].x || p.y !== sorted[i - 1].y);
    if (unique.length < 3) return unique;
    const lower = [], upper = [];
    for (const p of unique) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = unique.length - 1; i >= 0; i--) {
      const p = unique[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function inHull(hull, point) {
    if (!isPixel(point) || !Array.isArray(hull) || hull.length < 3) return false;
    let sign = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      const turn = cross(a, b, point);
      // Accept boundary points with a one-millionth-pixel numerical tolerance.
      if (Math.abs(turn) <= Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) * 1e-6) continue;
      if (sign && Math.sign(turn) !== sign) return false;
      sign = Math.sign(turn);
    }
    return true;
  }

  function metreScale(latitude) {
    const radians = latitude * Math.PI / 180;
    const e2 = 6.6943799901413165e-3;
    const denom = 1 - e2 * Math.sin(radians) ** 2;
    return {
      lng: 6378137 / Math.sqrt(denom) * Math.cos(radians) * Math.PI / 180,
      lat: 6378137 * (1 - e2) / denom ** 1.5 * Math.PI / 180
    };
  }

  function covariance(points) {
    const center = points.reduce((s, p) => ({ x: s.x + p.x / points.length, y: s.y + p.y / points.length }), { x: 0, y: 0 });
    let xx = 0, xy = 0, yy = 0;
    for (const p of points) { const x = p.x - center.x, y = p.y - center.y; xx += x * x; xy += x * y; yy += y * y; }
    const trace = xx + yy, det = xx * yy - xy * xy;
    const largest = (trace + Math.hypot(xx - yy, 2 * xy)) / 2;
    const smallest = largest > 0 ? Math.max(0, det / largest) : 0;
    return { center, xx, xy, yy, det, ratio: largest > 0 ? smallest / largest : 0 };
  }

  function validModel(model) {
    return !!model && model.valid === true && isWgs84(model.origin) && isPixel(model.pixel_origin)
      && finite(model.meters_per_degree?.lng) && model.meters_per_degree.lng > 0
      && finite(model.meters_per_degree?.lat) && model.meters_per_degree.lat > 0
      && ['east', 'north'].every(axis => Array.isArray(model.coefficients?.[axis]) && model.coefficients[axis].length === 3 && model.coefficients[axis].every(finite));
  }

  function containsPixel(model, point) { return validModel(model) && inHull(model.hull, point); }

  function pixelToGeo(model, point, options = {}) {
    if (!validModel(model) || !isPixel(point) || (!options.allowExtrapolation && !containsPixel(model, point))) return null;
    const x = point.x - model.pixel_origin.x, y = point.y - model.pixel_origin.y;
    const a = model.coefficients.east, b = model.coefficients.north;
    const coordinate = [model.origin[0] + (a[0] * x + a[1] * y + a[2]) / model.meters_per_degree.lng,
      model.origin[1] + (b[0] * x + b[1] * y + b[2]) / model.meters_per_degree.lat];
    return isWgs84(coordinate) ? coordinate : null;
  }

  function geoToPixel(model, coordinate, options = {}) {
    if (!validModel(model) || !isWgs84(coordinate)) return null;
    const a = model.coefficients.east, b = model.coefficients.north;
    const det = a[0] * b[1] - a[1] * b[0];
    if (!finite(det) || Math.abs(det) < 1e-15) return null;
    const east = (coordinate[0] - model.origin[0]) * model.meters_per_degree.lng - a[2];
    const north = (coordinate[1] - model.origin[1]) * model.meters_per_degree.lat - b[2];
    const point = { x: model.pixel_origin.x + (b[1] * east - a[1] * north) / det,
      y: model.pixel_origin.y + (-b[0] * east + a[0] * north) / det };
    if (!isPixel(point) || (!options.allowExtrapolation && !containsPixel(model, point))) return null;
    return point;
  }

  function residuals(model, points) {
    return points.map((point, index) => {
      const predicted = pixelToGeo(model, point.pixel, { allowExtrapolation: true });
      const east = (predicted[0] - point.coordinate[0]) * model.meters_per_degree.lng;
      const north = (predicted[1] - point.coordinate[1]) * model.meters_per_degree.lat;
      return { id: point.id || `point-${index + 1}`, error_m: Math.hypot(east, north), inside_hull: inHull(model.hull, point.pixel) };
    });
  }

  function errorSummary(errors) {
    return { count: errors.length, rms_m: errors.length ? Math.sqrt(errors.reduce((s, p) => s + p.error_m ** 2, 0) / errors.length) : null,
      max_m: errors.length ? Math.max(...errors.map(p => p.error_m)) : null, residuals: errors };
  }

  /**
   * Fit image pixels -> local WGS84 east/north metres, with an invertible affine model.
   * Sources are declarations only: "calibrated" is never a survey-accuracy certification.
   * Outside the control-point convex hull conversions require allowExtrapolation:true.
   * At least three non-collinear controls are required; five or more spread over the
   * full image and separate measured checkpoints are recommended.
   */
  function fit(controlPoints, options = {}) {
    const controls = Array.isArray(controlPoints) ? controlPoints : [];
    const model = { version: VERSION, type: 'local-wgs84-affine', valid: false, quality: 'estimated',
      origin: null, pixel_origin: null, meters_per_degree: null, coefficients: null, hull: [], extentGeo: null,
      diagnostics: { control_count: controls.length, rms_m: null, max_m: null, degenerate: false, reason: null, warnings: [],
        independent: { count: 0, rms_m: null, max_m: null, residuals: [] },
        accuracy_statement: 'Fit and checkpoint residuals are consistency checks, not proof of absolute GPS or survey accuracy.' } };
    const fail = (reason, degenerate = false) => { model.valid = false; model.diagnostics.reason = reason; model.diagnostics.degenerate = degenerate; return model; };
    if (controls.length < 3) return fail('at_least_three_controls_required', true);
    if (controls.some(p => !p || !isPixel(p.pixel) || !isWgs84(p.coordinate) || (p.accuracy_m != null && (!finite(p.accuracy_m) || p.accuracy_m < 0)))) return fail('invalid_control');
    const uniquePixels = new Set(controls.map(p => `${p.pixel.x},${p.pixel.y}`));
    if (uniquePixels.size !== controls.length) return fail('duplicate_control_pixel', true);
    model.origin = controls.reduce((s, p) => [s[0] + p.coordinate[0] / controls.length, s[1] + p.coordinate[1] / controls.length], [0, 0]);
    if (Math.abs(model.origin[1]) > 89) return fail('polar_region_not_supported');
    model.meters_per_degree = metreScale(model.origin[1]);
    const local = controls.map(p => ({ x: (p.coordinate[0] - model.origin[0]) * model.meters_per_degree.lng,
      y: (p.coordinate[1] - model.origin[1]) * model.meters_per_degree.lat }));
    const maxExtent = finite(options.maxExtentMeters) && options.maxExtentMeters > 0 ? options.maxExtentMeters : 20000;
    if (Math.hypot(Math.max(...local.map(p => p.x)) - Math.min(...local.map(p => p.x)), Math.max(...local.map(p => p.y)) - Math.min(...local.map(p => p.y))) > maxExtent) return fail('controls_exceed_local_extent');
    const imageCov = covariance(controls.map(p => p.pixel)), geoCov = covariance(local);
    const minRatio = finite(options.minEigenRatio) ? Math.max(1e-10, options.minEigenRatio) : 1e-4;
    model.diagnostics.pixel_eigen_ratio = imageCov.ratio;
    model.diagnostics.geo_eigen_ratio = geoCov.ratio;
    if (imageCov.ratio < minRatio || geoCov.ratio < minRatio) return fail('collinear_or_poorly_spread_controls', true);
    model.pixel_origin = imageCov.center;
    const solve = axis => {
      let sx = 0, sy = 0, mean = 0;
      controls.forEach((p, i) => { const v = local[i][axis]; sx += (p.pixel.x - imageCov.center.x) * v; sy += (p.pixel.y - imageCov.center.y) * v; mean += v / controls.length; });
      return [(imageCov.yy * sx - imageCov.xy * sy) / imageCov.det, (imageCov.xx * sy - imageCov.xy * sx) / imageCov.det, mean];
    };
    model.coefficients = { east: solve('x'), north: solve('y') };
    const a = model.coefficients.east, b = model.coefficients.north, determinant = a[0] * b[1] - a[1] * b[0];
    const stretch = covariance([{ x: 0, y: 0 }, { x: a[0], y: b[0] }, { x: a[1], y: b[1] }]);
    if (!finite(determinant) || Math.abs(determinant) < 1e-15 || stretch.ratio < minRatio) return fail('non_invertible_or_extreme_distortion', true);
    model.hull = convexHull(controls.map(p => p.pixel));
    model.valid = true;
    if (controls.some(p => !pixelToGeo(model, p.pixel, { allowExtrapolation: true }))) return fail('fitted_coordinates_outside_wgs84');
    model.pxPerMeter = (Math.hypot(b[1], b[0]) + Math.hypot(a[1], a[0])) / (2 * Math.abs(determinant));
    model.extentGeo = [Math.min(...controls.map(p => p.coordinate[0])), Math.min(...controls.map(p => p.coordinate[1])),
      Math.max(...controls.map(p => p.coordinate[0])), Math.max(...controls.map(p => p.coordinate[1]))];
    const declared = controls.every(p => typeof p.source === 'string' && p.source.trim() && !/default|estimated|synthetic|derived|virtual|unknown|approx/i.test(p.source));
    model.quality = declared ? 'calibrated' : 'estimated';
    model.sources = controls.map(p => ({ id: p.id || null, source: p.source || 'unknown', declared_accuracy_m: p.accuracy_m ?? null }));
    const training = errorSummary(residuals(model, controls));
    Object.assign(model.diagnostics, { rms_m: training.rms_m, max_m: training.max_m, training });
    if (controls.length < 5) model.diagnostics.warnings.push('fewer_than_five_controls');
    if (controls.length === 3) model.diagnostics.warnings.push('three_controls_have_no_redundancy');
    if (Math.min(imageCov.ratio, geoCov.ratio) < 0.001) model.diagnostics.warnings.push('narrow_control_coverage');
    if (training.max_m > (finite(options.warningResidualMeters) ? options.warningResidualMeters : 10)) model.diagnostics.warnings.push('large_control_residual');
    if (!declared) model.diagnostics.warnings.push('estimated_or_unknown_control_sources');
    const checkpoints = Array.isArray(options.checkpoints) ? options.checkpoints : [];
    const independent = [];
    for (const p of checkpoints) {
      if (!p || !isPixel(p.pixel) || !isWgs84(p.coordinate) || !pixelToGeo(model, p.pixel, { allowExtrapolation: true })) { model.diagnostics.warnings.push('invalid_checkpoint_excluded'); continue; }
      if (controls.some(c => (p.id && c.id === p.id) || Math.hypot(c.pixel.x - p.pixel.x, c.pixel.y - p.pixel.y) < 1e-6)) { model.diagnostics.warnings.push('checkpoint_duplicates_control_excluded'); continue; }
      independent.push(p);
    }
    model.diagnostics.independent = errorSummary(residuals(model, independent));
    if (!independent.length) model.diagnostics.warnings.push('no_independent_checkpoints');
    model.diagnostics.warnings = [...new Set(model.diagnostics.warnings)];
    return model;
  }

  return Object.freeze({ VERSION, fit, pixelToGeo, geoToPixel, containsPixel, isWgs84, convexHull, metreScale });
});
