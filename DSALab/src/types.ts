// src/types.ts

// ----------------------------------------------------
// 历史记录相关类型定义
// ----------------------------------------------------

// Shared HistoryEvent interfaces
export interface HistoryEventBase {
    timestamp: number;
    problemId: string;
    eventType: string; // e.g., 'edit', 'run_start', 'run_end', 'program_output'
  }
  
  export interface SimplifiedContentChange {
    range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
    rangeLength: number;
    text: string;
    rangeOffset: number;
  }
  
  export interface CodeEditEvent extends HistoryEventBase {
    eventType: 'edit';
    operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'other_edit';
    change: SimplifiedContentChange;
    cursorPosition: { lineNumber: number; column: number };
  }
  
  export interface ProgramRunStartEvent extends HistoryEventBase {
    eventType: 'run_start';
    codeSnapshot: string; // Full code at the moment of run
  }
  
  export interface ProgramOutputEvent extends HistoryEventBase {
    eventType: 'program_output' | 'program_error' | 'user_input';
    data: string;
    outputType: 'log' | 'error' | 'user-input' | 'info' | 'result'; // Corresponds to cpp-output-chunk types
  }
  
  export interface ProgramRunEndEvent extends HistoryEventBase {
    eventType: 'run_end' | 'compile_error' | 'run_timeout' | 'program_terminated_by_new_run';
    success: boolean;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    durationMs?: number; // Time taken for execution
    errorMessage?: string; // For compile_error, run_timeout, or general run_end error
  }
  
  export interface ProblemLifecycleEvent extends HistoryEventBase {
    eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched';
    codeSnapshot?: string; // Code at load/save/switch
    audioState?: 'present' | 'absent' | 'modified'; // Audio state at save
  }
  
  export interface AudioEvent extends HistoryEventBase {
    eventType: 'audio_record_start' | 'audio_record_pause' | 'audio_record_resume' | 'audio_record_stop' | 'audio_play';
    durationMs?: number; // For record_stop, play
    audioSizeKB?: number; // For record_stop
  }
  
  export type HistoryEvent = CodeEditEvent | ProgramRunStartEvent | ProgramOutputEvent | ProgramRunEndEvent | ProblemLifecycleEvent | AudioEvent;
  
  // ----------------------------------------------------
  // Window.electron 接口
  // ----------------------------------------------------
  declare global {
    interface Window {
      electron: {
        compileAndRunCpp: (problemId: string, code: string, timeout: number) => Promise<{ success: boolean; output: string; error: string }>;
        showOpenDialog: (filters?: Electron.FileFilter[]) => Promise<{ filePath: string; content: string } | null>;
        showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => Promise<string | null>;
        onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => void;
        sendUserInput: (problemId: string, input: string) => void;
        getProblemsFromLocal: () => Promise<Problem[]>;
        saveProblemsToLocal: (problems: Problem[]) => Promise<{ success: boolean; error?: string }>;
        readProblemCode: (problemId: string) => Promise<string | null>;
        readProblemAudio: (problemId: string) => Promise<ArrayBuffer | null>;
        saveProblemWorkspace: (problemId: string, codeContent: string, audioData: ArrayBuffer | null) => Promise<boolean>;
        onBeforeQuit: (callback: () => Promise<void>) => void;
        sendAppQuitAcknowledged: () => void;
        recordHistoryEvent: (event: HistoryEvent) => void;
        loadAppSettings: () => Promise<AppSettings>;
        saveAppSettings: (settings: AppSettings) => Promise<boolean>;
        refreshProblems: () => Promise<Problem[]>;
        getPureLocalProblems: () => Promise<Problem[]>;
        importProblems: (jsonContent: string) => Promise<{ success: boolean; problems?: Problem[]; invalidCount?: number; error?: string }>;
        exportProblemsToZip: (problemIds: string[], defaultFileName: string) => Promise<{ success: boolean; filePath?: string; message?: string }>;
      };
    }
  }
  
  // 定义主题的结构接口
  export interface ThemeDefinition {
    name: string;
    displayName: string;
    colors: {
      background: string;
      foreground: string;
      selection: string;
      lineHighlight: string;
      cursor: string;
    };
  }
  
  // 定义问题数据结构 (与 main.ts 中的 Problem 接口保持一致)
  export interface Problem {
    id: string;
    Title: string;
    shortDescription: string;
    fullDescription: string;
    isDelete: boolean;
    Audio: string;
    Code: string;
  }
  
  // 定义每个问题的工作区数据结构
  export interface ProblemWorkspaceData {
    content: string;
    isDirty: boolean;
    output: string;
    audioBlob: Blob | null;
    audioUrl: string | null;
    filePath: string | null;
    audioModified: boolean;
  }
  
  // 应用设置接口
  export interface AppSettings {
    userName: string;
    studentId: string;
    lastOpenedProblemId: string | null;
  }
  
  // 国际化翻译文本类型
  export type Translations = {
    [key: string]: string;
  };
  
  export type Language = 'en' | 'zh';
  
  export interface AppTranslations {
    en: Translations;
    zh: Translations;
  }