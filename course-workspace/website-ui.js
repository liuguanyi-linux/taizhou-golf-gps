if(CourseWebsite.enabled)(function(){
  const panel=document.createElement('section');panel.className='workspace-tools';
  const id=new URLSearchParams(location.search).get('gb');
  const back=document.querySelector('.workspace-bar a');if(back)back.href='/cn/map';
  panel.innerHTML='<h2>本地网站 · 项目后台</h2><p>普通编辑自动暂存到此浏览器。保存草稿不会更新前台；发布会替换本场已发布地图，并公开项目中的图片及点位。</p><label>距离字段单位<select id="site-unit"><option value="">请选择原数据单位</option><option value="m">米 m</option><option value="yd">码 yd</option></select></label><button id="site-save">保存到网站后台（草稿）</button><label><input type="checkbox" id="site-review">已核对球场、地图、点位隐私，同意替换本场前台地图</label><button id="site-publish">发布到本地网站前台</button><p id="site-status" role="status">尚未写入后台</p><a id="site-preview" target="_blank" rel="noopener">查看已发布项目</a><p><a href="/cn/admin/greenbook">返回网站后台选球场</a></p>';
  const siteDetails=document.createElement('details');siteDetails.className='workflow-advanced';siteDetails.innerHTML='<summary>网站后台保存 / 发布</summary>';siteDetails.append(panel);const flow=document.querySelector('.workflow-tools');if(flow)flow.after(siteDetails);else document.getElementById('side').prepend(siteDetails);
  const oldSave=document.getElementById('savesrv');oldSave.textContent='使用顶部“项目后台”保存';oldSave.title='原版保存接口不支持完整虚拟图项目，此模式统一走项目接口';
  oldSave.closest('.grp').querySelector('p').textContent='本机暂存不会自动发布。需保存到网站后台或发布前台，请使用顶部项目后台面板。';
  const $=id=>document.getElementById(id);
  $('site-preview').href='?'+new URLSearchParams({gb:id,workspace:'1',website:'1',public:'1'});
  const refresh=()=>{if($('site-unit'))$('site-unit').value=courseData?.distance_unit||'';if($('site-status'))$('site-status').textContent='已加载项目。本机暂存优先；使用下方按钮明确保存或发布。';};window.addEventListener('course-loaded',refresh);if(courseData)refresh();
  window.addEventListener('website-load-error',e=>{siteDetails.open=true;const status=$('site-status')||panel.querySelector('p');if(status)status.textContent='项目未加载：'+e.detail;});
  if(CourseWebsite.lastError){siteDetails.open=true;$('site-status').textContent='项目未加载：'+CourseWebsite.lastError;}
  if(CourseWebsite.publicView){panel.innerHTML='<h2>已发布工具项目</h2><p>当前为已发布版本的本机体验副本。可以测试编辑与 GPS，但任何修改都不会写回网站后台。重新打开恢复发布版本。</p><a href="/cn/map">返回球场地图</a>';return;}
  const recover=document.createElement('button');recover.textContent='读取后台版本（先备份本机修改）';panel.append(recover);recover.onclick=()=>{if(!confirm('此操作将替换当前球场在本浏览器的暂存。请先用“下载完整项目包”保存本机修改。确认读取后台版本？'))return;const url=new URL(location.href);url.searchParams.set('reload_backend','1');location.href=url;};
  const workflow=document.querySelector('.workflow-tools');if(workflow){const paragraphs=workflow.querySelectorAll(':scope > p');if(paragraphs[0])paragraphs[0].textContent='在同一网站中制作地图、虚拟图与 GPS 数据，再通过项目后台保存或发布。';if(paragraphs.length>1)paragraphs[paragraphs.length-1].textContent='编辑先暂存到本浏览器；顶部可保存后台草稿或明确发布。下载包用于离线备份，不等于发布。';}
  document.querySelector('#side .sub').textContent='本地网站集成模式：WGS84 点线面、虚拟图和 GPS 共用数据。使用顶部“保存到网站后台”持久保存。';
  async function submit(publish){
    if(!courseData){$('site-status').textContent='项目尚未加载，请先登录后台并重新打开。';return;}
    if(publish&&!$('site-review').checked){$('site-status').textContent='请先核对并勾选发布确认。';return;}
    $('site-save').disabled=$('site-publish').disabled=true;
    try{if(saveHole(true)===false)throw Error('当前洞未能保存');courseData.distance_unit=$('site-unit').value;if(!['m','yd'].includes(courseData.distance_unit))throw Error('请明确现有距离字段的单位，不会自动猜测');
      $('site-status').textContent='正在整理图片并上传完整项目…';const r=await CourseWebsite.save(courseData,publish);CourseStore.save(GB,courseData);$('site-status').textContent='后台第 '+r.revision+' 版已'+(r.published?'发布；前台地图和完整项目已更新。':'保存为草稿；前台保持原样。');$('site-review').checked=false;
    }catch(e){$('site-status').textContent='未完成：'+e.message;}finally{$('site-save').disabled=$('site-publish').disabled=false;}
  }
  $('site-save').onclick=()=>submit(false);$('site-publish').onclick=()=>submit(true);
})();
