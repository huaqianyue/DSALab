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

// 新增：应用设置接口
interface AppSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}

// 新增：Problem 接口 (保持与 main.ts 和 renderer.ts 一致)
interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  isDelete: boolean; // 确保这里也与 main.ts 和 renderer.ts 保持一致
  Audio: string; // 'audio.webm' if present, '' if not
  Code: string;  // 'code.cpp' if present, '' if not
}

// ----------------------------------------------------
// 修改：contextBridge.exposeInMainWorld
// ----------------------------------------------------
contextBridge.exposeInMainWorld('electron', {
  compileAndRunCpp: (problemId: string, code: string, timeout: number) => ipcRenderer.invoke('compile-and-run-cpp', problemId, code, timeout),
  showOpenDialog: (filters?: Electron.FileFilter[]) => ipcRenderer.invoke('show-open-dialog', filters), // Added filters parameter
  showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => ipcRenderer.invoke('show-save-dialog', currentFilePath, defaultFileName, content),
  onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => {
    ipcRenderer.removeAllListeners('cpp-output-chunk');
    ipcRenderer.on('cpp-output-chunk', (_event, chunk) => callback(chunk));
  },
  sendUserInput: (problemId: string, input: string) => {
    ipcRenderer.send('send-user-input', problemId, input);
  },

  // --- 新增的持久化相关 IPC 方法 ---
  getProblemsFromLocal: () => ipcRenderer.invoke('get-problems-from-local'),
  saveProblemsToLocal: (problems: Problem[]) => ipcRenderer.invoke('save-problems-to-local', problems),
  readProblemCode: (problemId: string) => ipcRenderer.invoke('read-problem-code', problemId),
  readProblemAudio: (problemId: string) => ipcRenderer.invoke('read-problem-audio', problemId),
  saveProblemWorkspace: (problemId: string, codeContent: string, audioData: ArrayBuffer | null) => ipcRenderer.invoke('save-problem-workspace', problemId, codeContent, audioData),
  onBeforeQuit: (callback: () => Promise<void>) => {
    ipcRenderer.removeAllListeners('app-before-quit');
    ipcRenderer.on('app-before-quit', async (event) => {
      await callback();
      event.sender.send('app-quit-acknowledged');
    });
  },
  // 新增：用于在渲染进程中发送 app-quit-acknowledged 消息
  sendAppQuitAcknowledged: () => ipcRenderer.send('app-quit-acknowledged'),

  // --- 新增：历史记录 IPC 方法 ---
  recordHistoryEvent: (event: HistoryEvent) => ipcRenderer.send('record-history-event', event),

  // --- 新增：应用设置 IPC 方法 ---
  loadAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke('save-app-settings', settings),

  // --- 新增：刷新问题列表 IPC 方法 ---
  refreshProblems: (): Promise<Problem[]> => ipcRenderer.invoke('refresh-problems'),

  // --- 新增：纯粹读取本地问题列表 IPC 方法 ---
  getPureLocalProblems: (): Promise<Problem[]> => ipcRenderer.invoke('get-pure-local-problems'), // <-- 这一行是缺失的，现在已添加

  // --- 新增：导入问题列表 IPC 方法 ---
  importProblems: (jsonContent: string): Promise<{ success: boolean; problems?: Problem[]; invalidCount?: number; error?: string }> => ipcRenderer.invoke('import-problems', jsonContent),

  // --- 新增：导出问题到ZIP IPC 方法 ---
  exportProblemsToZip: (problemIds: string[], defaultFileName: string) => ipcRenderer.invoke('export-problems-to-zip', problemIds, defaultFileName),

  // --- 新增：在默认浏览器中打开链接 ---
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});