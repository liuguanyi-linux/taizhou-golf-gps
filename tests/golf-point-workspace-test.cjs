const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = require('node:path').resolve(__dirname, '..');
const api = require(root + '/holemap-gps/point-workspace.js');
let passed = 0;
function check(name, run) { run(); passed += 1; console.log('PASS ' + name); }
const point = {id:'cart-a',name:'球车 A',kind:'cart',coordinate:[120.1,32.1],source:'gps_import',accuracy_m:2.4,updated_at:'2026-09-07T04:00:00Z'};
check('valid point normalization preserves source, accuracy and timestamp', () => {
  const normalized = api.normalizePoint(point); assert.equal(normalized.errors.length,0); assert.equal(normalized.point.accuracy_m,2.4); assert.equal(normalized.point.updated_at,'2026-09-07T04:00:00.000Z');
});
for (const invalid of [['',32],[' ',32],[null,32],[false,32],[{},32],['Infinity',32],[181,32],[120,91],[NaN,32]]) {
  check('invalid coordinate ' + JSON.stringify(invalid), () => assert.equal(api.normalizePoint({...point,coordinate:invalid}).point,null));
}
check('zero coordinate is valid when explicit', () => assert.deepEqual(api.coordinate([0,0]),[0,0]));
check('blank accuracy stays unknown instead of zero', () => assert.equal(api.normalizePoint({...point,accuracy_m:''}).point.accuracy_m,null));
check('negative accuracy is rejected', () => assert.equal(api.normalizePoint({...point,accuracy_m:-1}).point,null));
check('missing id is rejected', () => assert.equal(api.normalizePoint({coordinate:[120,32]}).point,null));
check('numeric id zero remains stable', () => assert.equal(api.normalizePoint({...point,id:0}).point.id,'0'));
check('bad calendar date is rejected', () => assert.equal(api.normalizePoint({...point,updated_at:'2026-02-30T00:00:00Z'}).point,null));
check('timestamp requires timezone', () => assert.equal(api.normalizePoint({...point,updated_at:'2026-09-07T00:00:00'}).point,null));
const ring = [[120,32],[120.2,32],[120.2,32.2],[120,32.2],[120,32]];
check('hole inside', () => assert.equal(api.rangeStatus([120.1,32.1],{holeperim:ring}),'inside'));
check('hole boundary', () => assert.equal(api.rangeStatus([120,32.1],{holeperim:ring}),'boundary'));
check('hole outside', () => assert.equal(api.rangeStatus([121,33],{holeperim:ring}),'outside'));
check('missing boundary stays unknown', () => assert.equal(api.rangeStatus([120,32],{}),'unknown'));
check('invalid boundary stays unknown', () => assert.equal(api.rangeStatus([120,32],{holeperim:[[null,1],[2,3],[4,5]]}),'unknown'));
check('WGS84 equator one degree reference', () => assert.ok(Math.abs(api.distanceMeters([0,0],[1,0])-111319.49079327357)<0.001));
check('zero point distance', () => assert.equal(api.distanceMeters(point,point),0));
check('invalid origin does not silently become zero', () => assert.ok(Number.isNaN(api.distanceMeters(['',0],[0,0]))));
check('antipodal fallback explicitly labelled', () => assert.equal(api.geodesic([0,0],[180,0]).method,'spherical-fallback'));
check('distance symmetry', () => assert.ok(Math.abs(api.distanceMeters([120.1,32.1],[121,33])-api.distanceMeters([121,33],[120.1,32.1]))<0.001));
const fixture={slug:'test-course',holes:[{n:1,holeperim:ring,tees:{black:[120,32]},flag:[120.15,32.15],device_points:[point]}, {n:2,holeperim:ring,flag:[120.19,32.19],device_points:[{...point,coordinate:[120.18,32.18]}]}]};
const before = JSON.stringify(fixture);
const catalog = api.buildCatalog(fixture);
check('same local id in different holes has distinct stable global ids', () => {
  assert.equal(catalog.errors.length,0); const carts=catalog.points.filter(p=>p.kind==='cart'); assert.equal(new Set(carts.map(p=>p.id)).size,2); assert.equal(carts[0].id,'test-course/hole/1/device/cart-a');
});
check('duplicate local ids in same hole reported', () => assert.ok(api.buildCatalog({holes:[{n:1,device_points:[point,point]}]}).errors.some(e=>e.code==='duplicate_id')));
check('legacy points are diagnosed, not silently called stable', () => assert.ok(api.buildCatalog({holes:[{n:1,device_points:[{coordinate:[120,32]}]}]}).errors.some(e=>e.code==='legacy_id')));
check('cross-hole multi-target distances and errors coexist', () => {
  const result=api.measure(catalog.points[0], [...catalog.points.filter(p=>p.hole===2),{id:'bad',coordinate:['',3]}],{course:fixture});
  assert.equal(result.unit,'m'); assert.equal(result.distance_type,'surface_geodesic_not_route'); assert.equal(result.errors.length,1); assert.ok(result.results.length>1); assert.ok(result.results.every(r=>r.distance_m>0));
});
check('export carries markers, boundaries and measurement provenance', () => {
  const exported=api.exportGeoJSON(fixture); assert.ok(exported.features.some(f=>f.geometry.type==='Polygon')); const cart=exported.features.find(f=>f.id==='test-course/hole/1/device/cart-a'); assert.equal(cart.properties.accuracy_m,2.4); assert.equal(cart.properties.source,'gps_import'); assert.equal(cart.properties.registration_quality,'unverified');
});
check('export unknown precision never claims coordinate decimals are measurement accuracy', () => assert.equal(api.exportGeoJSON(fixture).features.find(f=>f.properties.type==='tee').properties.accuracy_m,null));
check('all operations leave source draft untouched', () => assert.equal(JSON.stringify(fixture),before));
check('JSON telemetry parses two carts', () => {const r=api.parseTelemetry(JSON.stringify([point,{...point,id:'cart-b'}]));assert.equal(r.positions.length,2);assert.equal(r.errors.length,0)});
check('JSON telemetry invalid coordinate rejects only invalid record', () => {const r=api.parseTelemetry(JSON.stringify([point,{...point,id:'bad',coordinate:['',32]}]));assert.equal(r.positions.length,1);assert.equal(r.errors[0].row,2)});
check('CSV quoted names and BOM parse', () => {const r=api.parseTelemetry('\ufeffid,name,longitude,latitude,timestamp,accuracy_m\r\na,"车, A",120.1,32.1,2026-09-07T04:00:00Z,3\r\n');assert.equal(r.errors.length,0);assert.equal(r.positions[0].name,'车, A');assert.equal(r.positions[0].accuracy_m,3)});
check('CSV missing coordinate and bad timestamp fail', () => {const r=api.parseTelemetry('id,longitude,latitude,timestamp\na,,32.1,bad');assert.equal(r.positions.length,0);assert.equal(r.errors.length,2)});
check('CSV unterminated quote fails', () => assert.ok(api.parseTelemetry('id,longitude,latitude\n"oops,120,32').errors.length));
check('CSV duplicate columns rejected', () => assert.ok(api.parseTelemetry('id,longitude,latitude,id\na,120,32,b').errors.length));
check('telemetry duplicate identity rejected', () => {const r=api.parseTelemetry(JSON.stringify([point,point]));assert.equal(r.positions.length,1);assert.ok(r.errors.some(e=>e.code==='duplicate_id'))});
check('telemetry missing timestamps remain visibly unknown', () => assert.equal(api.parseTelemetry('[{"id":"a","coordinate":[120,32]}]').positions[0].timestamp,null));
check('invalid telemetry JSON and primitive rejected safely', () => {assert.ok(api.parseTelemetry('null','json').errors.length);assert.ok(api.parseTelemetry('[null,1]').errors.length)});
const course = JSON.parse(fs.readFileSync(root + '/holemap-data/cn0000385-codex.json','utf8'));
check('current 18-hole course catalogue and export have unique references', () => {const c=api.buildCatalog(course);const e=api.exportGeoJSON(course);assert.equal(course.holes.length,18);assert.equal(c.errors.length,0);assert.equal(c.points.length,144);assert.equal(e.features.length,162);assert.equal(new Set(e.features.map(f=>f.id)).size,e.features.length)});
console.log('All '+passed+' checks passed. Read-only: no course data or browser storage modified.');
