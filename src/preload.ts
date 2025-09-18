import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  compileAndRunCpp: (code: string, timeout: number) => ipcRenderer.invoke('compile-and-run-cpp', code, timeout),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => ipcRenderer.invoke('show-save-dialog', currentFilePath, defaultFileName, content),
  // 新增：用于接收主进程的实时C++输出块
  onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => {
    // 移除之前的监听器以避免重复注册
    ipcRenderer.removeAllListeners('cpp-output-chunk');
    ipcRenderer.on('cpp-output-chunk', (_event, chunk) => callback(chunk));
  },
  // 新增：用于向主进程发送用户输入
  sendUserInput: (input: string) => {
    ipcRenderer.send('send-user-input', input);
  }
});