// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  compileAndRunCpp: (code: string, timeout: number) => ipcRenderer.invoke('compile-and-run-cpp', code, timeout),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => ipcRenderer.invoke('show-save-dialog', currentFilePath, defaultFileName, content),
  // 如果有其他需要暴露的API，可以在这里添加
});