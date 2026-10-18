'use strict';
const {app,BrowserWindow,protocol,net,ipcMain,shell,session,dialog,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const P=require('./policy.cjs');
const root=path.resolve(__dirname,'..');
protocol.registerSchemesAsPrivileged([{scheme:'golf',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
// Stable application identity and origin keep IndexedDB/localStorage across upgrades.
const userData=path.join(app.getPath('appData'),'GolfCourseWorkbench');
fs.mkdirSync(userData,{recursive:true});app.setPath('userData',userData);
let window,update=null,checking=false,lastCheck=0;
if(!app.requestSingleInstanceLock())app.quit();
else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request){
  if(!P.localURL(request.url))return new Response('Forbidden',{status:403});
  const url=new URL(request.url);
  if(url.pathname==='/recognition/local')return json({installed:false,error:'桌面安装版未捆绑独立 Python 模型；可使用公开地图、手工编辑和图片配准。'},request.method==='GET'?200:503);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  // Only public, fixed-destination read bridges; no admin/auth/POST pass-through.
  if(url.pathname.startsWith('/course-source/')||url.pathname.startsWith('/map-source/')){
    const handler=url.pathname.startsWith('/course-source/')?require('../scripts/greenbook-readonly.cjs'):require('../scripts/osm-readonly.cjs');
    return new Promise(resolve=>{let status=200,headers={};const res={writeHead:(s,h)=>{status=s;headers=h;},end:body=>resolve(new Response(body,{status,headers}))};handler.handle({method:request.method,headers:{}},res,url).catch(()=>resolve(json({error:'数据源不可用'},503)));});
  }
  const file=P.publicFile(root,request.url);
  if(!file)return new Response('Forbidden',{status:403});
  try{if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw Error();return net.fetch(pathToFileURL(file).href);}catch(_){return new Response('Not found',{status:404});}
}
function trusted(event){if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!P.localURL(event.senderFrame.url))throw Error('Untrusted caller');}
async function check(){
  if(checking)throw Error('正在检查，请稍候');
  if(Date.now()-lastCheck<15000)return {current:app.getVersion(),update};
  checking=true;
  try{
    const r=await net.fetch('https://api.github.com/repos/liuguanyi-linux/taizhou-golf-gps/releases?per_page=100',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('更新服务返回 '+r.status+'，请稍后重试');
    update=P.selectRelease(await r.json(),app.getVersion(),process.platform,process.arch);lastCheck=Date.now();return {current:app.getVersion(),update};
  }finally{checking=false;}
}
app.whenReady().then(()=>{
  protocol.handle('golf',handle);
  // Permission prompts are explicit; never auto-approve GPS, camera or microphone.
  session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>wc===window?.webContents&&permission==='geolocation'&&P.localURL(origin));
  session.defaultSession.setPermissionRequestHandler(async(wc,permission,callback)=>{
    if(wc!==window?.webContents||permission!=='geolocation'||!P.localURL(wc.getURL()))return callback(false);
    const result=await dialog.showMessageBox(window,{type:'question',buttons:['不允许','允许本次定位'],defaultId:0,cancelId:0,message:'允许球场工作台使用系统定位？',detail:'仅用于当前测距；桌面电脑通常没有 GPS，不保证现场定位精度。'});callback(result.response===1);
  });
  ipcMain.handle('golf:info',event=>{trusted(event);return {version:app.getVersion(),platform:process.platform,arch:process.arch,updateMode:'download-installer'};});
  ipcMain.handle('golf:check-update',event=>{trusted(event);return check();});
  ipcMain.handle('golf:download-update',async event=>{trusted(event);if(!update)throw Error('请先检查更新');await shell.openExternal(update.url);return true;});
  function create(){
    window=new BrowserWindow({width:1360,height:900,minWidth:800,minHeight:600,title:'球场工作台',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\/(?:github\.com|liuguanyi-linux\.github\.io)\//.test(url))shell.openExternal(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(!P.localURL(url)){event.preventDefault();if(/^https:\/\/(?:github\.com|liuguanyi-linux\.github\.io)\//.test(url))shell.openExternal(url);}});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.loadURL('golf://app/cn/map/');
    window.on('close',event=>{if(!window.webContents.isLoading()&&dialog.showMessageBoxSync(window,{type:'question',message:'已保存本机项目了吗？',detail:'未完成的绘制请先保存；重要项目建议导出包含图片的项目包。',buttons:['返回工作台','退出'],defaultId:0,cancelId:0})===0)event.preventDefault();});
    window.on('closed',()=>{window=null;});
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'球场工作台',submenu:[{role:'about'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}]));
  create();app.on('activate',()=>{if(!window)create();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
