const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('GolfDesktop',Object.freeze({
  info:()=>ipcRenderer.invoke('golf:info'),
  checkUpdate:()=>ipcRenderer.invoke('golf:check-update'),
  downloadUpdate:()=>ipcRenderer.invoke('golf:download-update')
}));
