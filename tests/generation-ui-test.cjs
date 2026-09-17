'use strict';
const test=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const G=require('../course-workspace/generator.js'),S=require('../course-workspace/store.js'),R=require('../course-workspace/course-recognition.js');
// Small DOM contract harness: executes the actual UI handlers, no browser storage or network.
function harness(elements,{applyError=false,fetchError=false}={}){
  const ids=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.dataset={};this.classList={toggle(){}};}
    set id(v){this._id=v;ids.set(v,this);}get id(){return this._id;}
    set innerHTML(html){for(const match of html.matchAll(/<([a-z]+)\b([^>]*)>/g)){const id=match[2].match(/\bid="([^"]+)"/),draw=match[2].match(/data-draw="([^"]+)"/);if(id||draw){const el=new Element(match[1]);if(id)el.id=id[1];if(draw)el.dataset.draw=draw[1];this.append(el);}}}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
    prepend(...nodes){this.append(...nodes);}before(...nodes){this.parentElement?.append(...nodes);}
    replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);if(this.tagName==='SELECT')this.value=nodes[0]?.value||'';}
    add(node){this.append(node);}setAttribute(k,v){this[k]=v;}querySelectorAll(){return this.children.filter(c=>c.dataset.draw);}
    scrollIntoView(){}focus(){}
  }
  const layer=()=>({addTo(){return this;},bindTooltip(){return this;},getBounds(){return {};},openTooltip(){}});
  let course=S.blank('界面测试',[120,30],18),applies=0,drawn=null,vectors=0;
  const body=new Element(),host=new Element();body.append(host);
  const sandbox={CourseGenerator:G,document:{createElement:t=>new Element(t),getElementById:id=>ids.get(id),body},Option:class extends Element{constructor(t,v){super('option');this.textContent=t;this.value=String(v);}},map:{removeLayer(){},fitBounds(){}},L:{featureGroup:layer,polygon:layer,polyline:layer,circleMarker:layer,latLngBounds:x=>x},C2L:p=>[p[1],p[0]],setTimeout,URLSearchParams,AbortSignal,fetch:async()=>{if(fetchError)throw Error('离线');return {ok:true,json:async()=>({elements})};}};
  sandbox.CourseRecognition=R;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../course-workspace/generation-ui.js'),'utf8'),sandbox);
  sandbox.createGenerationUI(host,{course:()=>course,hole:()=>course.holes[0],sync:()=>true,real(){},vector(){vectors++;},download(){},gps(){},draw:(kind,n)=>{drawn={kind,n};},apply:c=>{if(applyError)throw Error('保存空间不足');applies++;course=c;}});
  return {$:id=>ids.get(id),read:()=>ids.get('generate-map-data').onclick(),get applies(){return applies;},get drawn(){return drawn;},get course(){return course;},get vectors(){return vectors;}};
}
const way=(id,tags,c)=>({type:'way',id,tags,geometry:c.map(([lon,lat])=>({lon,lat}))});
const site=way(1,{leisure:'golf_course',name:'测试边界'},[[120,30],[120.01,30],[120.01,30.01],[120,30.01],[120,30]]);
const green=name=>way(2,{golf:'green',name},[[120.001,30.001],[120.002,30.001],[120.002,30.002],[120.001,30.001]]);
test('zero accepted features explains water-only result, disables apply and exposes per-hole drawing',async()=>{
  const h=harness([site,way(3,{natural:'water'},[[121,31],[122,31],[122,32],[121,31]])]);await h.read();
  a.equal(h.$('generation-apply').disabled,true);a.match(h.$('generation-apply').textContent,/暂无/);a.match(h.$('generation-info').textContent,/水域 1 项/);a.equal(h.$('generation-help').hidden,false);
  await h.$('generation-apply').onclick();a.equal(h.applies,0);
  h.$('generation-draw-hole').value='3';await h.$('generation-help').querySelectorAll().find(b=>b.dataset.draw==='cartroute').onclick();a.deepEqual(h.drawn,{kind:'cartroute',n:3});
});
test('unassigned checked feature cannot generate until a hole is selected',async()=>{
  const h=harness([site,green('未标洞号')]);await h.read();const row=h.$('generation-rows').children[0],check=row.children[0],select=row.children[2];
  a.equal(h.$('generation-apply').disabled,true);check.checked=true;check.onchange();a.match(h.$('generation-apply').textContent,/指定洞号/);
  select.value='1';select.onchange();a.equal(h.$('generation-apply').disabled,false);
  const pending=h.$('generation-apply').onclick();a.match(h.$('generation-apply').textContent,/正在生成/);await h.$('generation-apply').onclick();await pending;
  a.equal(h.applies,1);a.equal(h.vectors,1);a.equal(h.course.holes[0].map_sources.length,1);a.equal(h.$('generation-apply').disabled,true);
});
test('save failure remains visible and re-enables retry without success message',async()=>{
  const h=harness([site,green('Hole 1')],{applyError:true});await h.read();await h.$('generation-apply').onclick();
  a.equal(h.applies,0);a.match(h.$('generation-error').textContent,/保存空间不足/);a.equal(h.$('generation-apply').disabled,false);a.doesNotMatch(h.$('generation-summary').textContent,/已生成/);
});
test('no boundary, wrong site and read failure recover without data mutation',async()=>{
  const h=harness([]);await h.read();a.equal(h.$('generation-help').hidden,false);a.equal(h.$('generation-apply').disabled,true);
  const s=harness([site,green('Hole 1')]);await s.read();s.$('generation-site').value='';s.$('generation-site').onchange();a.equal(s.$('generation-apply').disabled,true);
  const offline=harness([],{fetchError:true});await offline.read();a.match(offline.$('generation-summary').textContent,/离线/);a.equal(offline.$('generate-map-data').disabled,false);a.equal(offline.applies,0);
});
test('whole-course corridor candidate is proposed but never checked automatically',async()=>{
  const line=(id,n,x)=>way(id,{golf:'hole',ref:String(n)},[[x,30.001],[x,30.009]]);
  const h=harness([site,line(10,1,120.0015),line(11,2,120.008),green('候选果岭')]);await h.read();
  const row=h.$('generation-rows').children.find(r=>r.children[1].textContent.includes('候选果岭'));
  a.equal(row.children[2].value,'1');a.equal(row.children[0].checked,false);a.match(h.$('recognition-plan').textContent,/中线候选 1 项/);
  row.children[0].checked=true;row.children[0].onchange();await h.$('generation-apply').onclick();
  a.equal(h.applies,1);a.equal(h.course.recognition_review.field_verified,false);a.ok(h.course.recognition_review.assignments.some(x=>x.id==='way/2'&&x.n===1));
});
test('georeferenced candidate paste enters the same review and retains non-OSM provenance',async()=>{
  const h=harness([]);h.$('recognition-input').value=JSON.stringify({type:'FeatureCollection',coordinate_system:'WGS84',source:{name:'离线测试候选',method:'fixture'},features:[{type:'Feature',id:'boundary',properties:{kind:'course'},geometry:{type:'Polygon',coordinates:[site.geometry.map(p=>[p.lon,p.lat])]}},{type:'Feature',id:'test-green',properties:{kind:'green',hole:1},geometry:{type:'Polygon',coordinates:[green().geometry.map(p=>[p.lon,p.lat])]}}]});
  await h.$('recognition-import').onclick();a.equal(h.applies,0);a.equal(h.$('generation-apply').disabled,false);await h.$('generation-apply').onclick();
  a.equal(h.applies,1);a.equal(h.course.holes[0].map_sources[0].source,'离线测试候选');a.equal(h.course.holes[0].green.length,4);
});
test('invalid pasted candidate and all-hole audit never mutate course geometry',async()=>{
  const h=harness([]),before=JSON.stringify(h.course);h.$('recognition-input').value='{}';await h.$('recognition-import').onclick();a.match(h.$('generation-summary').textContent,/候选未接入/);a.equal(h.applies,0);
  h.$('recognition-audit').onclick();a.match(h.$('recognition-audit-report').textContent,/第 18 洞/);a.equal(JSON.stringify(h.course),before);
});
