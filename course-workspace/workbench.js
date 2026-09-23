/* Daily-use shell. Move existing controls, never duplicate map or project state. */
function createCourseWorkbench(api){
  'use strict';
  const $=id=>document.getElementById(id),side=$('side'),bar=document.querySelector('.workspace-bar');
  document.body.classList.add('workbench');
  const workflow=document.querySelector('.workflow-tools'),points=$('simple-points'),advanced=$('simple-advanced'),editing=$('simple-map-edit');
  const tabs=document.createElement('nav');tabs.className='workbench-tabs';tabs.setAttribute('aria-label','工作区');
  const panels=document.createElement('div');panels.className='workbench-panels';
  side.prepend(tabs,panels);
  const sections=new Map();
  for(const [key,label,node] of [['make','制作',workflow],['points','放点测距',points],['advanced','高级',advanced]]){
    const b=document.createElement('button');b.type='button';b.id='workbench-tab-'+key;b.textContent=label;b.setAttribute('aria-controls','workbench-panel-'+key);tabs.append(b);
    const section=document.createElement('section');section.id='workbench-panel-'+key;section.setAttribute('aria-label',label);section.append(node);panels.append(section);sections.set(key,section);
    b.onclick=()=>activate(key);
  }
  // Keep original IDs and handlers for compatibility, but remove duplicate entry points.
  const parked=document.createElement('div');parked.hidden=true;parked.id='workbench-internal';
  side.append(parked);
  for(const id of ['mode-real','mode-vector','mode-hd','mode-gps','flow-edit'])parked.append($(id));
  points.open=advanced.open=true;
  points.querySelector(':scope > summary').hidden=true;advanced.querySelector(':scope > summary').hidden=true;
  advanced.prepend(editing);
  const extra=document.createElement('details');extra.className='workbench-extra';extra.innerHTML='<summary>更多生成选项</summary>';
  const oldOptions=workflow.querySelector(':scope > details');
  if(oldOptions){extra.append(...[...oldOptions.children].filter(n=>n.tagName!=='SUMMARY'));oldOptions.remove();}
  advanced.prepend(extra);
  const delivery=$('flow-delivery');
  const sub=workflow.querySelector('.workflow-secondary');if(sub)sub.remove();
  side.replaceChildren(tabs,panels,parked);
  const footer=document.createElement('p');footer.className='workbench-footer';footer.textContent='本机草稿 · 实地精度未核验';side.append(footer);

  const view=document.createElement('select');view.id='workbench-view';view.setAttribute('aria-label','地图视图');
  view.add(new Option('卫星地图','mode-real'));view.add(new Option('高清虚拟图','mode-hd'));view.add(new Option('矢量地图','mode-vector'));
  bar.insertBefore(view,$('mode-cart'));$('mode-cart').textContent='预览';$('mode-cart').title='球车设备预览';
  bar.insertBefore($('workspace-hole'),view);
  delivery.textContent='导出';bar.append(delivery);
  const menu=document.createElement('button');menu.id='workbench-menu';menu.textContent='工具';menu.setAttribute('aria-controls','side');menu.setAttribute('aria-expanded','false');bar.prepend(menu);
  const veil=document.createElement('button');veil.className='workbench-veil';veil.hidden=true;veil.setAttribute('aria-label','收起工具面板');document.body.append(veil);
  function mobile(open){document.body.classList.toggle('workbench-side-open',open);menu.setAttribute('aria-expanded',String(open));veil.hidden=!open;}
  menu.onclick=async()=>{const open=!document.body.classList.contains('workbench-side-open');if(open)await $('mode-real').onclick();mobile(open);};veil.onclick=()=>mobile(false);
  view.onchange=async()=>{try{await $(view.value).onclick();}catch(e){api.status(e.message);}finally{updateView();}};
  function updateView(){const active=['mode-hd','mode-vector','mode-real'].find(id=>$(id).getAttribute('aria-pressed')==='true');view.value=active||'mode-real';if(active==='mode-hd')mobile(false);}
  const observer=new MutationObserver(updateView);for(const id of ['mode-real','mode-vector','mode-hd'])observer.observe($(id),{attributes:true,attributeFilter:['aria-pressed']});updateView();

  // One placement selector replaces four competing buttons. Existing actions remain authoritative.
  const panel=points.querySelector('.workspace-tools'),row=$('place-cart').parentElement;
  const picker=document.createElement('label');picker.textContent='添加内容';
  const type=document.createElement('select');type.id='workbench-add-type';
  for(const [value,label] of [['place-cart','球车位置'],['place-point','目标点'],['place-pin','果岭旗'],['draw-route','球车路线']])type.add(new Option(label,value));picker.append(type);
  const add=document.createElement('button');add.id='workbench-add';add.textContent='在图上放置';add.className='wide';row.before(picker,add);
  for(const id of ['place-cart','place-point','place-pin','draw-route'])parked.append($(id));row.remove();
  const precise=document.createElement('details');precise.className='workbench-extra';precise.innerHTML='<summary>坐标与定位高级设置</summary>';
  for(const el of [...panel.children])if(el.tagName==='DETAILS')precise.append(el);panel.append(precise);
  const pointName=$('point-name').parentElement;picker.after(pointName);
  panel.querySelector('h2').textContent='放点测距';
  $('cancel-tool').textContent='完成 / 取消操作';
  type.onchange=()=>{api.cancel();add.textContent=type.value==='draw-route'?'在图上绘制':'在图上放置';};
  add.onclick=()=>{$(type.value).click();mobile(false);};
  $('cancel-tool').addEventListener('click',()=>mobile(false));
  const help=document.createElement('p');help.className='workbench-help';help.textContent='选择内容后在地图上点击；已有点可拖动。';picker.before(help);
  let active='make';
  function activate(key){
    if(!sections.has(key))return;
    api.cancel();api.endEditing?.();active=key;
    for(const [k,node] of sections){node.hidden=k!==key;$('workbench-tab-'+k).setAttribute('aria-pressed',String(k===key));}
    document.body.dataset.workbenchPanel=key;side.scrollTop=0;api.resize();
  }
  // Existing shortcuts reveal their owning panel, including asynchronous generation failures.
  function reveal(element){const owner=[...sections].find(([,s])=>s.contains(element));if(owner&&active!==owner[0])activate(owner[0]);for(let p=element;p&&p!==side;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;mobile(matchMedia('(max-width: 700px)').matches);element.scrollIntoView({block:'nearest'});}
  editing.addEventListener('toggle',()=>document.body.classList.toggle('workbench-drawing',editing.open));
  document.addEventListener('workbench-reveal',e=>{if(e.detail instanceof HTMLElement)reveal(e.detail);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){mobile(false);api.cancel();}});
  const onResize=()=>{if(!matchMedia('(max-width: 700px)').matches)mobile(false);api.resize();};window.addEventListener('resize',onResize);
  activate('make');
  return {reveal,activate,updateView};
}
