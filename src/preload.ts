// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  compileAndRunCpp: (code: string, timeout: number) => ipcRenderer.invoke('compile-and-run-cpp', code, timeout),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => ipcRenderer.invoke('show-save-dialog', currentFilePath, defaultFileName, content),
  onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => {
    ipcRenderer.removeAllListeners('cpp-output-chunk');
    ipcRenderer.on('cpp-output-chunk', (_event, chunk) => callback(chunk));
  },
  sendUserInput: (input: string) => {
    ipcRenderer.send('send-user-input', input);
  },

  // --- 新增的持久化相关 IPC 方法 ---
  getProblemsFromLocal: () => ipcRenderer.invoke('get-problems-from-local'),
  saveProblemsToLocal: (problems: any[]) => ipcRenderer.invoke('save-problems-to-local', problems),
  readProblemCode: (problemId: string) => ipcRenderer.invoke('read-problem-code', problemId),
  readProblemAudio: (problemId: string) => ipcRenderer.invoke('read-problem-audio', problemId),
  /**
   * 保存指定问题的代码和音频文件。
   * @param problemId 题目ID。
   * @param codeContent 代码内容。
   * @param audioData 音频数据（ArrayBuffer 或 null）。
   * @returns Promise<boolean> 保存是否成功。
   */
  saveProblemWorkspace: (problemId: string, codeContent: string, audioData: ArrayBuffer | null) => ipcRenderer.invoke('save-problem-workspace', problemId, codeContent, audioData),

  onBeforeQuit: (callback: () => Promise<void>) => {
    ipcRenderer.removeAllListeners('app-before-quit');
    ipcRenderer.on('app-before-quit', async (event) => {
      await callback(); // 等待渲染进程完成保存
      event.sender.send('app-quit-acknowledged'); // 通知主进程可以退出
    });
  },
});