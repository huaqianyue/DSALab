// DSALab 相关类型定义

// 历史记录相关类型定义
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
  deletedText?: string; // 被删除的文本（仅用于删除操作）
}

export interface CodeEditEvent extends HistoryEventBase {
  eventType: 'edit';
  operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'undo_redo' | 'other_edit';
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

export interface TestStartEvent extends HistoryEventBase {
  eventType: 'test_start';
  codeSnapshot: string; // Full code at the moment of test
}

export interface TestResultEvent extends HistoryEventBase {
  eventType: 'test_completed' | 'test_failed';
  testPassed: boolean;
  score: number;
  passedTests: number;
  totalTests: number;
  details?: string; // Test output details
  errorMessage?: string; // For test_failed
}

// 调试相关事件类型定义
export interface DebugControlEvent extends HistoryEventBase {
  eventType: 'debug_button_clicked' | 'debug_start' | 'debug_exit';
  codeSnapshot?: string; // 调试开始时的代码快照（仅用于 debug_start）
}

// 调试单步执行事件（合并操作和结果）
export interface DebugStepEvent extends HistoryEventBase {
  eventType: 'debug_step';
  stepType: 'continue' | 'stepover' | 'stepinto' | 'stepout' | 'restart';
  stopReason?: string; // 停止原因：breakpoint-hit, end-stepping-range, function-finished, exited 等
  stopLocation?: { file: string; line: number; code?: string }; // 停止位置（包含该行代码）
  exitCode?: number; // 退出代码（如果程序退出）
}

export interface DebugBreakpointEvent extends HistoryEventBase {
  eventType: 'breakpoint_add' | 'breakpoint_remove' | 'breakpoint_condition_change';
  line: number;
  fileName: string;
  condition?: string; // 断点条件表达式
  hitCount?: number; // 命中次数
}

export interface DebugConsoleOutputEvent extends HistoryEventBase {
  eventType: 'debug_console_output';
  outputData: string; // 调试控制台输出内容
}

export interface DebugStateChangeEvent extends HistoryEventBase {
  eventType: 'debug_program_running' | 'debug_program_stopped' | 'debug_program_exited';
  stopReason?: string; // 停止原因：breakpoint-hit, end-stepping-range, function-finished, exited 等
  stopLocation?: { file: string; line: number; code?: string }; // 停止位置（包含该行代码）
  exitCode?: number; // 退出代码
}

export interface DebugExpressionEvalEvent extends HistoryEventBase {
  eventType: 'debug_expr_eval';
  expression: string; // 求值的表达式
  result: string; // 求值结果
}

export interface DebugCommandEvent extends HistoryEventBase {
  eventType: 'debug_command_sent';
  command: string; // 发送的 GDB 命令
  success: boolean; // 命令是否成功
}

export type HistoryEvent = CodeEditEvent | ProgramRunStartEvent | ProgramOutputEvent | ProgramRunEndEvent | ProblemLifecycleEvent | AudioEvent | TestStartEvent | TestResultEvent | DebugControlEvent | DebugStepEvent | DebugBreakpointEvent | DebugConsoleOutputEvent | DebugStateChangeEvent | DebugExpressionEvalEvent | DebugCommandEvent;

// 定义问题数据结构
export interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  Audio: string;
  Code: string;
  // 新增测试相关字段
  studentDebugTemplate?: string;
  judgeTemplate?: string;
  functionSignature?: string;
  testStatus?: 'passed' | 'failed' | 'not_tested';
  testScore?: number; // 测试分数 (0-100)
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
export interface DSALabSettings {
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
