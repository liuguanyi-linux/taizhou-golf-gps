/* Shared install/update UI. Never clear project storage or silently reload an editor. */
(function(){
  'use strict';
  const base=new URL('../',document.currentScript.src),desktop=window.GolfDesktop;
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('app/client.css',base);document.head.append(link);
  for(const [rel,href] of [['manifest','manifest.webmanifest'],['apple-touch-icon','app/icon-192.png']]){const l=document.createElement('link');l.rel=rel;l.href=new URL(href,base);document.head.append(l);}
  const meta=document.createElement('meta');meta.name='theme-color';meta.content='#172314';document.head.append(meta);
  let registration,installPrompt,pending=false,applying=false;
  const dialog=document.createElement('dialog');dialog.id='golf-app-dialog';dialog.setAttribute('aria-labelledby','golf-app-title');
  dialog.innerHTML='<h2 id="golf-app-title">球场工作台</h2><p id="golf-app-version">正在读取版本…</p><p>更新前先保存项目，并导出包含图片的项目包。更新不会主动清空本机草稿；不同设备的数据不会自动同步。</p><p id="golf-app-status" role="status"></p><div class="golf-app-actions"><button id="golf-app-check">检查更新</button><button id="golf-app-apply" hidden></button><button id="golf-app-install">安装与下载</button><button id="golf-app-close">关闭</button></div><p id="golf-app-install-help" hidden></p>';
  document.body.append(dialog);const $=id=>document.getElementById('golf-app-'+id),status=msg=>$('status').textContent=msg;
  const button=document.createElement('button');button.type='button';button.id='golf-app-button';button.textContent='应用 / 更新';
  function mount(){const target=document.querySelector('.workspace-bar')||document.querySelector('.app-help')||document.querySelector('header')||document.querySelector('main nav')||document.body;if(button.parentElement!==target)target.append(button);}
  mount();const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});
  button.onclick=async()=>{dialog.showModal();try{const v=desktop?await desktop.info():await fetch(new URL('app/version.json',base)).then(r=>r.json());$('version').textContent='版本 '+v.version+(desktop?' · 桌面安装版':' · 主屏幕应用版');}catch(_){$('version').textContent='离线模式 · 版本信息暂不可用';}};
  $('close').onclick=()=>dialog.close();
  function ready(){pending=true;$('apply').hidden=false;$('apply').textContent=desktop?'下载新版安装包':'保存完成，重新打开新版';status(desktop?'发现新版。下载后退出当前应用，再运行安装包；Mac 替换应用即可。':'新版已准备好。请关闭其他工作台窗口，保存项目后再更新。');}
  if(!desktop&&'serviceWorker' in navigator&&['https:','http:'].includes(location.protocol)){
    navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'}).then(r=>{registration=r;if(r.waiting)ready();r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&r.waiting&&navigator.serviceWorker.controller)ready();});});}).catch(()=>status('离线组件注册失败；仍可在线使用，请检查网络后重试。'));
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying)location.reload();else if(navigator.serviceWorker.controller)status('应用资源已更新；正在编辑的内容不会自动刷新，请先保存。');});
  }
  $('check').onclick=async()=>{
    $('check').disabled=true;status('正在检查更新…');
    try{if(desktop){const r=await desktop.checkUpdate();if(r.update){ready();status('发现 '+r.update.version+'。保存并备份后下载安装；不会自动关闭工作台。');}else status('当前已是此设备可下载的最新应用版本。');}
      else{if(!navigator.onLine)throw Error('当前离线，请联网后检查');if(!registration)throw Error('离线组件未就绪，请稍后重试');await registration.update();if(registration.waiting)ready();else status(registration.installing?'正在下载新版本，完成后会显示更新按钮。':'未发现待安装更新。');}
    }catch(e){status('检查未完成：'+e.message);}finally{$('check').disabled=false;}
  };
  $('apply').onclick=async()=>{if(!pending||!confirm('确认已保存，并备份重要项目？更新期间请不要编辑。'))return;try{if(desktop){await desktop.downloadUpdate();status('已打开官方安装包下载。下载后退出本应用再安装；尚未自动安装。');}else if(registration?.waiting){applying=true;registration.waiting.postMessage({type:'ACTIVATE_SAVED_UPDATE'});}else{status('请重新检查更新。');}}catch(e){status(e.message);}};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  $('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;return;}const help=$('install-help');help.hidden=false;help.replaceChildren(document.createTextNode('iPhone/iPad：Safari 打开在线地址 → 分享 → 添加到主屏幕。Windows/Mac：从仓库下载对应安装包。安装版与浏览器草稿分开，请导出项目再导入。 '));const a=document.createElement('a');a.href='https://github.com/liuguanyi-linux/taizhou-golf-gps/releases/tag/app-v1.0.0';a.target='_blank';a.rel='noopener';a.textContent='打开安装包下载页';help.append(a);};
})();
