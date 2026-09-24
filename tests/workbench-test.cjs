const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// DOM contract harness: lookup searches only attached nodes, catching detached-control bugs.
function setup(){
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.hidden=false;this.events={};this.value='';this.textContent='';const c=new Set();this.classList={add:x=>c.add(x),contains:x=>c.has(x),toggle:(x,on)=>{on??=!c.has(x);on?c.add(x):c.delete(x);return on;}};}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
    remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
    append(...xs){for(const x of xs){x.remove();x.parentElement=this;this.children.push(x);}}
    prepend(...xs){for(const x of xs.reverse()){x.remove();x.parentElement=this;this.children.unshift(x);}}
    before(...xs){for(const x of xs)this.parentElement.insertBefore(x,this);}after(...xs){const p=this.parentElement,tail=p.children[p.children.indexOf(this)+1];for(const x of xs)p.insertBefore(x,tail);}
    insertBefore(x,ref){x.remove();x.parentElement=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,x);}
    replaceChildren(...xs){for(const c of [...this.children])c.remove();this.append(...xs);}
    contains(el){return this===el||this.children.some(c=>c.contains(el));}
    find(fn){for(const c of this.children){if(fn(c))return c;const hit=c.find(fn);if(hit)return hit;}return null;}
    querySelector(s){const direct=s.startsWith(':scope > ');s=s.replace(':scope > ','');const match=c=>s[0]==='.'?c.className===s.slice(1):c.tagName===s.toUpperCase();return direct?this.children.find(match)||null:this.find(match);}
    set innerHTML(s){const m=s.match(/<summary>(.*?)<\/summary>/);if(m){const n=new Element('summary');n.textContent=m[1];this.append(n);}}
    add(x){this.append(x);if(!this.value)this.value=x.value;}addEventListener(k,f){this.events[k]=f;}scrollIntoView(){}click(){return this.onclick?.();}
  }
  const body=new Element('body'),make=(tag,id,parent,cls)=>{const e=new Element(tag);e.id=id;e.className=cls||'';parent?.append(e);return e;};
  const bar=make('nav','',body,'workspace-bar'),side=make('div','side',body);
  const doc={body,createElement:t=>new Element(t),getElementById:id=>body.find(e=>e.id===id),querySelector:s=>body.querySelector(s),addEventListener(){}};
  const $=doc.getElementById;
  for(const id of ['mode-real','mode-vector','mode-hd','mode-gps','mode-cart','workspace-save'])make('button',id,bar);
  make('select','workspace-hole',bar);$('mode-real').setAttribute('aria-pressed','true');
  const flow=make('section','',side,'workflow-tools');make('h2','',flow);const sub=make('div','',flow,'workflow-secondary');make('button','flow-edit',sub);const delivery=make('button','flow-delivery',sub);
  const old=make('details','',flow);make('summary','',old);make('button','flow-source',old);
  for(const id of ['simple-points','simple-advanced','simple-map-edit']){const d=make('details',id,side);make('summary','',d);}
  const panel=make('section','',$('simple-points'),'workspace-tools');make('h2','',panel);
  const name=make('label','',panel);make('input','point-name',name);const row=make('div','',panel);make('button','place-cart',row);make('button','place-point',row);
  for(const id of ['place-pin','draw-route','cancel-tool'])make('button',id,panel);
  const fine=make('details','precision',panel);make('summary','',fine);
  let clicks=0,cancels=0,ends=0,exports=0;const cart=$('place-cart');cart.onclick=()=>clicks++;delivery.onclick=()=>exports++;
  const sandbox={document:doc,window:{addEventListener(){}},HTMLElement:Element,matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},Option:class extends Element{constructor(t,v){super('option');this.textContent=t;this.value=v;}}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../course-workspace/workbench.js'),'utf8'),sandbox);
  const api=sandbox.createCourseWorkbench({cancel:()=>cancels++,endEditing:()=>ends++,resize(){},status(){}});
  return {$,api,body,cart,delivery,fine,get clicks(){return clicks;},get cancels(){return cancels;},get ends(){return ends;},get exports(){return exports;}};
}
test('one default panel, original handlers preserved and duplicate controls hidden',()=>{
  const h=setup();assert.equal(h.$('workbench-panel-make').hidden,false);assert.equal(h.$('workbench-panel-points').hidden,true);assert.equal(h.$('workbench-panel-advanced').hidden,true);
  assert.equal(h.$('place-cart'),h.cart);assert.ok(h.$('workbench-internal').contains(h.cart));assert.equal(h.$('workbench-internal').hidden,true);
  assert.equal(h.$('flow-delivery'),h.delivery);h.delivery.click();assert.equal(h.exports,1);
});
test('placement selector dispatches once to the original action',()=>{
  const h=setup();h.api.activate('points');assert.equal(h.$('workbench-panel-points').hidden,false);assert.equal(h.$('workbench-panel-make').hidden,true);
  h.$('workbench-add').click();assert.equal(h.clicks,1);h.$('workbench-add-type').value='draw-route';h.$('workbench-add-type').onchange();assert.equal(h.$('workbench-add').textContent,'在图上绘制');
});
test('revealing advanced settings opens the owning panel; switching ends draw/edit modes',()=>{
  const h=setup();h.api.reveal(h.fine);assert.equal(h.$('workbench-panel-points').hidden,false);assert.equal(h.fine.open,true);
  h.api.reveal(h.$('simple-map-edit'));assert.equal(h.$('workbench-panel-advanced').hidden,false);assert.equal(h.$('simple-map-edit').open,true);assert.ok(h.ends>=3);assert.equal(h.ends,h.cancels);
});
test('view switch delegates to existing handler and reflects the actual resulting mode',async()=>{
  const h=setup();let calls=0;h.$('mode-vector').onclick=()=>{calls++;h.$('mode-real').setAttribute('aria-pressed','false');h.$('mode-vector').setAttribute('aria-pressed','true');};
  h.$('workbench-view').value='mode-vector';await h.$('workbench-view').onchange();assert.equal(calls,1);assert.equal(h.$('workbench-view').value,'mode-vector');
});
test('map instruction is temporary and cancellation remains available outside the drawer',()=>{
  const h=setup(),task=h.$('workbench-task');assert.equal(task.hidden,true);
  h.api.setTask('沿车道依次点击');assert.equal(task.hidden,false);assert.equal(h.$('workbench-task-hint').textContent,'沿车道依次点击');
  assert.ok(!h.$('side').contains(task));assert.equal(h.$('cancel-tool').hidden,true);
  const before=h.cancels;h.$('workbench-task-cancel').click();assert.equal(h.cancels,before+1);assert.equal(task.hidden,true);
  h.api.setTask('放置球车');h.api.activate('make');assert.equal(task.hidden,true);
});
test('view selector rejects concurrent activation and unlocks after failure',async()=>{
  const h=setup(),view=h.$('workbench-view');let reject,calls=0;
  h.$('mode-hd').onclick=()=>{calls++;return new Promise((resolve,no)=>{reject=no;});};
  view.value='mode-hd';const pending=view.onchange();assert.equal(view.disabled,true);
  await view.onchange();assert.equal(calls,1);reject(Error('test failure'));await pending;
  assert.equal(view.disabled,false);assert.equal(view.value,'mode-real');
});
