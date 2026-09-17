const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),store=require('../course-workspace/store.js'),pw=require('../holemap-gps/point-workspace.js');
const data=new Map();global.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
const original=JSON.parse(fs.readFileSync(path.join(root,'holemap-data/cn0000385-codex.json')));
test('existing 18-hole geometry passes compatibility validation',()=>assert.equal(store.validate(original).holes.length,18));
test('new venue has no fabricated geometry or flag',()=>{const c=store.blank('Test',[119,32]);assert.equal(c.holes.length,18);assert.equal(c.accuracy_m,null);assert.ok(c.holes.every(h=>!h.green.length&&!Object.keys(h.tees).length&&!h.flag));});
test('negative / nonnumeric venue coordinate rejected',()=>assert.throws(()=>store.blank('Bad',[500,'32'])));
test('duplicate hole rejected',()=>assert.throws(()=>store.validate({...original,holes:[original.holes[0],original.holes[0]]})));
test('GCJ02 is not silently interpreted as WGS84',()=>assert.throws(()=>store.validate({...original,coordinate_system:'GCJ02'})));
test('malformed imported geometry rejected',()=>assert.throws(()=>store.validate({...original,holes:[{n:1,green:[[120,32],[900,32],[120,33]]}]})));
test('unknown field and registration survives whole-course save',()=>{const c=structuredClone(original);c.holes[0].future_field={a:1};store.save('test',c);assert.deepEqual(store.read('test').holes[0].future_field,{a:1});});
test('legacy cart_test maps to interoperable cart',()=>{const p=pw.normalizePoint({id:'cart-a',kind:'cart_test',coordinate:[120,32]});assert.equal(p.errors.length,0);assert.equal(p.point.kind,'cart');});
test('two courses isolate drafts',()=>{store.save('one',store.blank('One',[119,32]));store.save('two',store.blank('Two',[120,32]));assert.equal(store.read('one').name,'One');assert.equal(store.read('two').name,'Two');});
test('telemetry coordinate JSON and CSV both supported',()=>{for(const [s,f] of [['{"positions":[{"id":"a","coordinate":[120,32]}]}','json'],['id,longitude,latitude\na,120,32','csv']])assert.equal(pw.parseTelemetry(s,f).positions.length,1);});
test('invalid telemetry causes no partial acceptance in UI',()=>{assert.ok(pw.parseTelemetry('{"positions":[{"id":"a","coordinate":[900,32]}]}','json').errors.length);});
test('course geometry is not modified by point catalog export',()=>{const before=JSON.stringify(original);pw.exportGeoJSON(original);assert.equal(JSON.stringify(original),before);});
console.log(passed+' integration model checks passed. Not field precision verification.');
