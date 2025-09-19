// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// ----------------------------------------------------
// 新增：历史记录相关类型定义
// ----------------------------------------------------

// Shared HistoryEvent interfaces
interface HistoryEventBase {
  timestamp: number;
  problemId: string;
  eventType: string; // e.g., 'edit', 'run_start', 'run_end', 'program_output'
}

interface SimplifiedContentChange {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  rangeLength: number;
  text: string;
  rangeOffset: number;
}

interface CodeEditEvent extends HistoryEventBase {
  eventType: 'edit';
  operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'other_edit';
  change: SimplifiedContentChange;
  cursorPosition: { lineNumber: number; column: number };
}

interface ProgramRunStartEvent extends HistoryEventBase {
  eventType: 'run_start';
  codeSnapshot: string; // Full code at the moment of run
}

interface ProgramOutputEvent extends HistoryEventBase {
  eventType: 'program_output' | 'program_error' | 'user_input';
  data: string;
  outputType: 'log' | 'error' | 'user-input' | 'info' | 'result'; // Corresponds to cpp-output-chunk types
}

interface ProgramRunEndEvent extends HistoryEventBase {
  eventType: 'run_end' | 'compile_error' | 'run_timeout' | 'program_terminated_by_new_run';
  success: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs?: number; // Time taken for execution
  errorMessage?: string; // For compile_error, run_timeout, or general run_end error
}

interface ProblemLifecycleEvent extends HistoryEventBase {
  eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched';
  codeSnapshot?: string; // Code at load/save/switch
  audioState?: 'present' | 'absent' | 'modified'; // Audio state at save
}

interface AudioEvent extends HistoryEventBase {
  eventType: 'audio_record_start' | 'audio_record_stop' | 'audio_play';
  durationMs?: number; // For record_stop, play
  audioSizeKB?: number; // For record_stop
}

type HistoryEvent = CodeEditEvent | ProgramRunStartEvent | ProgramOutputEvent | ProgramRunEndEvent | ProblemLifecycleEvent | AudioEvent;

// ----------------------------------------------------
// 修改：contextBridge.exposeInMainWorld
// ----------------------------------------------------
contextBridge.exposeInMainWorld('electron', {
  compileAndRunCpp: (problemId: string, code: string, timeout: number) => ipcRenderer.invoke('compile-and-run-cpp', problemId, code, timeout), // Added problemId
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => ipcRenderer.invoke('show-save-dialog', currentFilePath, defaultFileName, content),
  onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => {
    ipcRenderer.removeAllListeners('cpp-output-chunk');
    ipcRenderer.on('cpp-output-chunk', (_event, chunk) => callback(chunk));
  },
  sendUserInput: (problemId: string, input: string) => { // Added problemId
    ipcRenderer.send('send-user-input', problemId, input);
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

  // --- 新增：历史记录 IPC 方法 ---
  recordHistoryEvent: (event: HistoryEvent) => ipcRenderer.send('record-history-event', event),
});