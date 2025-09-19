// renderer.ts
/**
 * DSALab - C++ Playground
 */

import './index.css'; //导入主样式文件，应用于整个应用程序的UI

// Monaco Editor imports
import * as monaco from 'monaco-editor';

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
// 修改：Window.electron 接口
// ----------------------------------------------------
declare global {
  interface Window {
    electron: {
      /**
       * 调用主进程编译并运行 C++ 代码。
       * @param problemId 当前题目ID。
       * @param code 要编译和运行的 C++ 代码字符串。
       * @param timeout 执行超时时间（毫秒）。
       * @returns 一个 Promise，包含执行结果：success（是否成功）、output（标准输出）、error（错误信息）。
       */
      compileAndRunCpp: (problemId: string, code: string, timeout: number) => Promise<{ success: boolean; output: string; error: string }>;
      /**
       * 调用主进程显示一个打开文件对话框。
       * @param filters 可选的文件过滤器。
       * @returns 一个 Promise，包含选定文件的路径和内容，如果用户取消则返回 null。
       */
      showOpenDialog: (filters?: Electron.FileFilter[]) => Promise<{ filePath: string; content: string } | null>;
      /**
       * 调用主进程显示一个保存文件对话框。
       * @param currentFilePath 当前文件的路径，用于作为保存对话框的默认路径。
       * @param defaultFileName 默认的文件名。
       * @param content 要保存的文件内容。
       * @returns 一个 Promise，包含保存文件的路径，如果用户取消则返回 null。
       */
      showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => Promise<string | null>;
      /**
       * 监听主进程发送的C++程序输出块。
       * @param callback 接收输出块的回调函数。
       */
      onCppOutputChunk: (callback: (chunk: { type: string; data: string }) => void) => void;
      /**
       * 向主进程发送用户输入。
       * @param problemId 当前题目ID。
       * @param input 用户输入的字符串。
       */
      sendUserInput: (problemId: string, input: string) => void;

      // --- 新增的持久化相关 IPC 方法 ---
      getProblemsFromLocal: () => Promise<Problem[]>;
      saveProblemsToLocal: (problems: Problem[]) => Promise<{ success: boolean; error?: string }>;
      readProblemCode: (problemId: string) => Promise<string | null>;
      readProblemAudio: (problemId: string) => Promise<ArrayBuffer | null>;
      saveProblemWorkspace: (problemId: string, codeContent: string, audioData: ArrayBuffer | null) => Promise<boolean>;
      onBeforeQuit: (callback: () => Promise<void>) => void;
      sendAppQuitAcknowledged: () => void; // 新增

      // --- 新增：历史记录 IPC 方法 ---
      recordHistoryEvent: (event: HistoryEvent) => void;

      // --- 新增：应用设置 IPC 方法 ---
      loadAppSettings: () => Promise<AppSettings>;
      saveAppSettings: (settings: AppSettings) => Promise<boolean>;

      // --- 新增：刷新问题列表 IPC 方法 ---
      refreshProblems: () => Promise<Problem[]>;

      // --- 新增：导入问题列表 IPC 方法 ---
      importProblems: (jsonContent: string) => Promise<{ success: boolean; problems?: Problem[]; invalidCount?: number; error?: string }>;

      // --- 新增：导出问题到ZIP IPC 方法 ---
      exportProblemsToZip: (problemIds: string[], defaultFileName: string) => Promise<{ success: boolean; filePath?: string; message?: string }>;
    };
  }
}

// 定义主题的结构接口
interface ThemeDefinition {
  name: string;  //主题的内部名称
  displayName: string;  //主题的显示名称
  colors: {  //主题颜色配置
    background: string;
    foreground: string;
    selection: string;
    lineHighlight: string;
    cursor: string;
  };
}

// 定义问题数据结构 (与 main.ts 中的 Problem 接口保持一致)
interface Problem {
  id: string;
  Title: string; // 新增 Title 字段
  shortDescription: string;
  fullDescription: string;
  Audio: string; // 存储相对路径，如果本地有音频文件
  Code: string;  // 存储相对路径，如果本地有代码文件
}

// 定义每个问题的工作区数据结构
interface ProblemWorkspaceData {
  content: string;
  isDirty: boolean; // 代码内容是否修改
  output: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  filePath: string | null; // 用于 showSaveDialog 的当前文件路径，与持久化无关
  audioModified: boolean; // 音频是否修改（新录制或删除）
}

// 新增：应用设置接口
interface AppSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}


// DSALab 应用程序的主类，负责整个前端应用的逻辑和状态
class DSALabApp {
  // 单个 Monaco Editor 实例
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  // 存储所有问题数据 (从本地 problems.json 加载)
  private problems: Problem[] = [];
  // 当前激活的问题ID
  private currentProblemId: string | null = null;
  // 存储每个问题的工作区数据 (内存中的状态)
  private problemWorkspaceData: Map<string, ProblemWorkspaceData> = new Map();

  private suppressDirtyFlag: boolean = false; // 新增：用于抑制编辑器内容变化时设置isDirty
  private isComposing: boolean = false; // 新增：用于跟踪输入法合成状态

  // 代码执行的最大超时时间（30秒）。
  private readonly EXECUTION_TIMEOUT = 30000;

  private recordingStartTime: number | null = null; // 新增：记录录制开始时间

  // 硬编码的编辑器设置，不再使用 AppSettings 接口
  private currentLanguage: 'en' | 'zh' = 'zh'; // 默认语言为中文
  private readonly defaultTheme = 'github-dark';
  private readonly defaultFontSize = 14;
  private readonly defaultWordWrap = true;
  private readonly defaultMinimap = false;
  private readonly defaultLineNumbers = true;
  private readonly defaultTabSize = 2;
  private readonly defaultFontFamily = 'JetBrains Mono';

  // 定义可用的主题列表 (仅用于主题定义，不用于设置UI)
  private themes: ThemeDefinition[] = [
    {
      name: 'github-dark',
      displayName: 'GitHub Dark',
      colors: {
        background: '#0d1117',
        foreground: '#e6edf3',
        selection: '#264f78',
        lineHighlight: '#21262d',
        cursor: '#e6edf3'
      }
    },
    {
      name: 'tomorrow-night-bright',
      displayName: 'Tomorrow Night Bright',
      colors: {
        background: '#000000',
        foreground: '#eaeaea',
        selection: '#424242',
        lineHighlight: '#2a2a2a',
        cursor: '#eaeaea'
      }
    }
  ];

  // 应用程序的国际化翻译文本
  private translations = {
    en: {
      run: 'Run',
      clear: 'Clear',
      export: 'Export',
      refresh: 'Refresh', // 新增
      import: 'Import',   // 新增
      save: 'Save',       // 新增
      recordAudio: 'Record Audio',
      playAudio: 'Play Audio',
      prevProblem: 'Previous Problem',
      nextProblem: 'Next Problem',
      // Tooltips
      runTooltip: 'Run (Ctrl+R)',
      clearTooltip: 'Clear output',
      exportTooltip: 'Export current problem code and audio',
      refreshTooltip: 'Refresh problem list from online', // 新增
      importTooltip: 'Import problem list from JSON file', // 新增
      saveTooltip: 'Save current problem (Ctrl+S)', // 新增
      recordAudioTooltip: 'Record audio explanation',
      playAudioTooltip: 'Play recorded audio',
      prevProblemTooltip: 'Go to previous problem',
      nextProblemTooltip: 'Go to next problem',
      confirmSaveOnClose: 'Do you want to save changes to',
      compiling: 'Compiling C++ code...',
      running: 'Compilation successful, running...',
      compilationFailed: 'Compilation failed',
      executionTimedOut: 'Execution timed out',
      runtimeError: 'Runtime error',
      compilerNotFound: 'Compiler Error: g++ not found',
      programExitedNonZero: 'Program exited with non-zero status code',
      noOutput: 'Code executed, no output.',
      error: 'Error',
      previousProgramTerminated: 'Previous program was forcefully terminated.',
      noProgramToReceiveInput: 'Error: No program is currently running to receive input.',
      microphoneAccessFailed: 'Failed to access microphone',
      recordingStarted: 'Started audio recording...',
      recordingStopped: 'Recording stopped.',
      playbackFailed: 'Failed to play audio.',
      loadingProblemsFailed: 'Failed to load problems:',
      selectProblem: 'Please select a problem from the "Problem List" on the left to view its description.',
      selectProblemEditor: 'Please select a problem from the "Problem List" on the left to start coding.', // 新增编辑器提示
      savingData: 'Saving current problem data...',
      dataSaved: 'Current problem data saved.',
      saveFailed: 'Failed to save current problem data:',
      exportProblems: 'Export Problems', // 新增
      selectProblemsToExport: 'Please select problems to export:', // 新增
      exportCancelled: 'Export cancelled.', // 新增
      exportSuccess: 'Problems exported successfully to:', // 新增
      exportFailed: 'Failed to export problems:', // 新增
      missingCodeAudio: 'Missing Code or Audio', // 新增
      importSuccess: 'Problems imported successfully. {count} valid problems added/updated. {invalidCount} invalid problems skipped.', // 新增
      importFailed: 'Failed to import problems:', // 新增
      importInvalidFormat: 'Invalid JSON format or structure.', // 新增
      refreshSuccess: 'Problem list refreshed successfully.', // 新增
      refreshFailed: 'Failed to refresh problem list:', // 新增
    },
    zh: { // 中文翻译
      run: '运行',
      clear: '清空',
      export: '导出',
      refresh: '刷新', // 新增
      import: '导入',   // 新增
      save: '保存',       // 新增
      recordAudio: '录制',
      playAudio: '播放',
      prevProblem: '前一题',
      nextProblem: '后一题',
      // Tooltips
      runTooltip: '运行 (Ctrl+R)',
      clearTooltip: '清空输出',
      exportTooltip: '导出当前题目代码和讲解音频',
      refreshTooltip: '从在线刷新题目列表', // 新增
      importTooltip: '从JSON文件导入题目列表', // 新增
      saveTooltip: '保存当前题目 (Ctrl+S)', // 新增
      recordAudioTooltip: '录制音频讲解',
      playAudioTooltip: '播放录制音频',
      prevProblemTooltip: '切换到上一题',
      nextProblemTooltip: '切换到下一题',
      confirmSaveOnClose: '是否保存',
      compiling: '正在编译C++代码...',
      running: '编译成功，正在运行...',
      compilationFailed: '编译失败',
      executionTimedOut: '执行超时',
      runtimeError: '运行时错误',
      compilerNotFound: '编译器错误：g++ 未找到',
      programExitedNonZero: '程序以非零状态码退出',
      noOutput: '代码执行完成，无输出。',
      error: '错误',
      previousProgramTerminated: '上一个程序被强制终止。',
      noProgramToReceiveInput: '错误：没有正在运行的程序可以接收输入。',
      microphoneAccessFailed: '无法访问麦克风',
      recordingStarted: '开始录制音频...',
      recordingStopped: '录制结束。',
      playbackFailed: '播放音频失败。',
      loadingProblemsFailed: '加载题目失败:',
      selectProblem: '请从左侧的“题目列表”中选择一个题目查看其描述。',
      selectProblemEditor: '请从左侧的“题目列表”中选择一个题目开始编码。', // 新增编辑器提示
      savingData: '正在保存当前题目数据...',
      dataSaved: '当前题目数据已保存。',
      saveFailed: '保存当前题目数据失败:',
      exportProblems: '导出题目', // 新增
      selectProblemsToExport: '请选择要导出的题目：', // 新增
      exportCancelled: '导出已取消。', // 新增
      exportSuccess: '题目已成功导出到：', // 新增
      exportFailed: '导出题目失败：', // 新增
      missingCodeAudio: '缺少代码或音频', // 新增
      importSuccess: '题目导入成功。新增/更新 {count} 个有效题目，跳过 {invalidCount} 个无效题目。', // 新增
      importFailed: '导入题目失败：', // 新增
      importInvalidFormat: 'JSON格式或结构无效。', // 新增
      refreshSuccess: '题目列表刷新成功。', // 新增
      refreshFailed: '刷新题目列表失败：', // 新增
    }
  };

  // Audio recording properties
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioBlobUrl: string | null = null;
  private isRecording: boolean = false;

  // New: Terminal input properties
  private terminalInput: HTMLInputElement | null = null;
  private isProgramRunning: boolean = false; // 跟踪程序是否正在运行

  // Splitter properties
  private isDraggingMainSplitter = false;
  private isDraggingRightHorizontalSplitter = false;
  private mainSplitter: HTMLElement | null = null;
  private rightPanelHorizontalSplitter: HTMLElement | null = null;
  private problemDescriptionPanel: HTMLElement | null = null;
  private codeTestPanel: HTMLElement | null = null;
  private audioPanel: HTMLElement | null = null;
  private editorContainer: HTMLElement | null = null;
  private testOutputArea: HTMLElement | null = null;
  private problemPanelTabs: HTMLElement | null = null;

  // 新增：应用设置
  private appSettings: AppSettings = {
    userName: '',
    studentId: '',
    lastOpenedProblemId: null,
  };

  // 导出弹窗相关DOM元素
  private exportModal: HTMLElement | null = null;
  private exportProblemList: HTMLUListElement | null = null;
  private cancelExportBtn: HTMLButtonElement | null = null;
  private confirmExportBtn: HTMLButtonElement | null = null;
  private closeExportModalBtn: HTMLElement | null = null;


  // 构造函数，应用程序初始化时调用
  constructor() {
    this.initializeMonacoTheme(); // 初始化 Monaco Editor 主题
    this.createEditor(); // 创建单个编辑器实例
    // 调整初始化顺序：先加载设置，再根据设置加载问题和UI
    this.loadAppSettings().then(() => {
      this.fetchProblemsAndInitializeUI();  // 获取问题并初始化UI
      this.setupEventListeners();  // 设置DOM事件监听器
      this.setupTerminalInput(); // 设置终端输入
      this.setupIpcListeners(); // 设置IPC监听器
      this.setupSplitters(); // 设置分割线拖动功能
      this.setupKeyboardShortcuts(); // 新增：设置键盘快捷键
      this.setupExportModal(); // 新增：设置导出弹窗
    });
  }

  // 初始化 Monaco Editor 的自定义主题
  private initializeMonacoTheme(): void {
    // Configure Monaco Editor with GitHub Dark theme
    monaco.editor.defineTheme('github-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7d8590' },
        { token: 'keyword', foreground: 'ff7b72' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'number', foreground: '79c0ff' },
        { token: 'regexp', foreground: '7ee787' },
        { token: 'operator', foreground: 'ff7b72' },
        { token: 'namespace', foreground: 'ffa657' },
        { token: 'type', foreground: 'ffa657' },
        { token: 'struct', foreground: 'ffa657' },
        { token: 'class', foreground: 'ffa657' },
        { token: 'interface', foreground: 'ffa657' }, // Keeping for general syntax, not C++ specific
        { token: 'parameter', foreground: 'ffa657' },
        { token: 'variable', foreground: 'ffa657' },
        { token: 'function', foreground: 'd2a8ff' },
        { token: 'method', foreground: 'd2a8ff' }
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editorLineNumber.foreground': '#30363d',
        'editorLineNumber.activeForeground': '#6e7681',
        'editor.selectionBackground': '#264f78',
        'editor.selectionHighlightBackground': '#264f7840',
        'editorCursor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#21262d50'
      }
    });

    // Configure Monaco Editor with Tomorrow Night Bright theme
    monaco.editor.defineTheme('tomorrow-night-bright', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '969896', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'd54e53' },
        { token: 'string', foreground: 'b9ca4a' },
        { token: 'number', foreground: 'e78c45' },
        { token: 'regexp', foreground: 'b9ca4a' },
        { token: 'operator', foreground: 'd54e53' },
        { token: 'namespace', foreground: 'e7c547' },
        { token: 'type', foreground: 'e7c547' },
        { token: 'struct', foreground: 'e7c547' },
        { token: 'class', foreground: 'e7c547' },
        { token: 'interface', foreground: 'e7c547' }, // Keeping for general syntax
        { token: 'parameter', foreground: 'e7c547' },
        { token: 'variable', foreground: 'eaeaea' },
        { token: 'function', foreground: '7aa6da' },
        { token: 'method', foreground: '7aa6da' }
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#eaeaea',
        'editorLineNumber.foreground': '#666666',
        'editorLineNumber.activeForeground': '#eaeaea',
        'editor.selectionBackground': '#424242',
        'editor.lineHighlightBackground': '#2a2a2a'
      }
    });
  }

  // 创建单个 Monaco Editor 实例
  private createEditor(): void {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement; // 获取编辑器容器
    if (!editorContainer) {
      console.error('Editor container not found!');
      return;
    }

    this.editor = monaco.editor.create(editorContainer, {  // 创建 Monaco Editor 实例
      value: this.t('selectProblemEditor'),  // 初始内容为提示信息
      language: 'cpp', // 语言模式设置为 C++
      theme: this.defaultTheme,  // 应用硬编码的主题
      fontSize: this.defaultFontSize,  // 应用硬编码的字体大小
      fontFamily: this.defaultFontFamily,  // 应用硬编码的字体家族
      minimap: { enabled: this.defaultMinimap },  // 根据硬编码设置启用/禁用小地图
      scrollBeyondLastLine: false,  // 不允许滚动到最后一行之外
      automaticLayout: true,  // 自动布局，适应容器大小变化
      tabSize: this.defaultTabSize,  // 应用硬编码的 Tab 大小
      insertSpaces: true,  // 使用空格代替 Tab 键
      wordWrap: this.defaultWordWrap ? 'on' : 'off',  // 根据硬编码设置启用/禁用自动换行
      lineNumbers: this.defaultLineNumbers ? 'on' : 'off',  // 根据硬编码设置启用/禁用行号
      renderWhitespace: 'selection',  // 仅在选中时渲染空白字符
      contextmenu: false,  // 禁用右键菜单
      mouseWheelZoom: true, // 启用鼠标滚轮缩放
      cursorBlinking: 'blink', // 光标闪烁模式
      cursorSmoothCaretAnimation: 'on',  // 平滑光标动画
      smoothScrolling: true, // 平滑滚动
      folding: true, // 启用代码折叠
      foldingHighlight: true, // 启用折叠区域高亮
      showFoldingControls: 'always', // 始终显示折叠控制
      bracketPairColorization: { enabled: true }, // 启用括号对颜色化
      guides: { // 启用代码指南
        bracketPairs: true, // 括号对指南
        indentation: true // 缩进指南
      },
      hover: { enabled: true }, // 启用悬停提示
      quickSuggestions: true, // 启用快速建议
      suggestOnTriggerCharacters: true, // 在触发字符时显示建议
      acceptSuggestionOnEnter: 'on', // 按 Enter 键接受建议
      tabCompletion: 'on', // 启用 Tab 补全
      wordBasedSuggestions: 'currentDocument', // 基于当前文档的单词建议
      parameterHints: { enabled: true }, // 启用参数提示
      autoClosingBrackets: 'languageDefined',  // 自动关闭括号
      autoClosingQuotes: 'languageDefined', // 自动关闭引号
      autoSurround: 'languageDefined' // 自动环绕
    });

    // 监听 composition 事件以检测 IME 输入
    editorContainer.addEventListener('compositionstart', () => { this.isComposing = true; });
    editorContainer.addEventListener('compositionend', () => { this.isComposing = false; });

    // 监听编辑器内容变化，更新当前问题工作区的“已修改”状态并记录历史
    this.editor.onDidChangeModelContent((event) => {
      if (this.suppressDirtyFlag || !this.currentProblemId) { // 如果设置了抑制标志或没有当前问题，则不处理
        return;
      }

      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.isDirty = true;  // 设置为已修改
        problemData.content = this.editor!.getValue();  // 更新内存中的内容
        this.updateTitle();  // 更新窗口标题以显示修改状态
        this.updateSaveButtonState(); // 更新保存按钮状态
      }

      // 记录代码编辑历史
      if (this.currentProblemId) {
        const changes = event.changes;
        const cursorPosition = this.editor!.getPosition(); // 获取当前光标位置

        for (const change of changes) {
          let operationType: CodeEditEvent['operationType'] = 'other_edit';

          if (this.isComposing) {
            operationType = 'ime_input';
          } else if (change.text.length > 0 && change.rangeLength === 0) {
            // 插入操作
            if (change.text.length === 1) {
              operationType = 'type';
            } else {
              operationType = 'paste_insert';
            }
          } else if (change.text.length === 0 && change.rangeLength > 0) {
            // 删除操作
            operationType = 'delete';
          } else if (change.text.length > 0 && change.rangeLength > 0) {
            // 替换操作 (例如，粘贴覆盖选中内容)
            operationType = 'paste_replace';
          }

          const simplifiedChange: SimplifiedContentChange = {
            range: {
              startLineNumber: change.range.startLineNumber,
              startColumn: change.range.startColumn,
              endLineNumber: change.range.endLineNumber,
              endColumn: change.range.endColumn,
            },
            rangeLength: change.rangeLength,
            text: change.text,
            rangeOffset: change.rangeOffset,
          };

          this.recordHistoryEvent({
            timestamp: Date.now(),
            problemId: this.currentProblemId,
            eventType: 'edit',
            operationType: operationType,
            change: simplifiedChange,
            cursorPosition: cursorPosition ? { lineNumber: cursorPosition.lineNumber, column: cursorPosition.column } : { lineNumber: 1, column: 1 },
          });
        }
      }
    });
  }

  // 异步加载应用设置
  private async loadAppSettings(): Promise<void> {
    try {
      this.appSettings = await window.electron.loadAppSettings();
      // 填充用户输入框
      const userNameInput = document.getElementById('userNameInput') as HTMLInputElement;
      const studentIdInput = document.getElementById('studentIdInput') as HTMLInputElement;
      if (userNameInput) userNameInput.value = this.appSettings.userName;
      if (studentIdInput) studentIdInput.value = this.appSettings.studentId;
    } catch (error) {
      console.error('Failed to load app settings:', error);
      // 使用默认设置
      this.appSettings = { userName: '', studentId: '', lastOpenedProblemId: null };
    }
  }

  // 异步保存应用设置
  private async saveAppSettings(): Promise<void> {
    try {
      await window.electron.saveAppSettings(this.appSettings);
    } catch (error) {
      console.error('Failed to save app settings:', error);
    }
  }

  // 异步获取问题列表并初始化UI
  private async fetchProblemsAndInitializeUI(): Promise<void> {
    try {
      // 从主进程获取本地 problems.json
      this.problems = await window.electron.getProblemsFromLocal();
      this.renderProblemList(); // 渲染问题列表

      const problemDescriptionContent = document.getElementById('problemDescriptionContent') as HTMLElement;
      if (problemDescriptionContent) {
        problemDescriptionContent.innerHTML = `<p>${this.t('selectProblem')}</p>`;
      }
      this.editor?.setValue(this.t('selectProblemEditor')); // 编辑器显示提示
      this.toggleAudioPanelVisibility(false); // 隐藏音频面板
      this.activateProblemListTab(); // 激活题目列表标签页

      // 如果有上次打开的题目，尝试切换过去
      if (this.appSettings.lastOpenedProblemId) {
        const lastProblem = this.problems.find(p => p.id === this.appSettings.lastOpenedProblemId);
        if (lastProblem) {
          await this.switchToProblem(lastProblem.id);
        } else {
          this.appSettings.lastOpenedProblemId = null; // 上次打开的题目不存在了
          await this.saveAppSettings();
        }
      }
      this.updateSaveButtonState(); // 初始化保存按钮状态
    } catch (error) {
      console.error(this.t('loadingProblemsFailed'), error);
      const problemListContent = document.querySelector('.problem-list-content') as HTMLElement;
      if (problemListContent) {
        problemListContent.innerHTML = `<p style="color: red;">${this.t('loadingProblemsFailed')} ${error instanceof Error ? error.message : String(error)}</p>`;
      }
      const problemDescriptionContent = document.getElementById('problemDescriptionContent') as HTMLElement;
      if (problemDescriptionContent) {
        problemDescriptionContent.innerHTML = `<p style="color: red;">${this.t('loadingProblemsFailed')} ${error instanceof Error ? error.message : String(error)}</p>`;
      }
      this.editor?.setValue(`${this.t('loadingProblemsFailed')} ${error instanceof Error ? error.message : String(error)}`);
      this.toggleAudioPanelVisibility(false); // 隐藏音频面板
      this.updateSaveButtonState(); // 初始化保存按钮状态
    }
  }

  // 渲染问题列表
  private renderProblemList(): void {
    const problemListUl = document.querySelector('.problem-list') as HTMLUListElement;
    if (!problemListUl) return;

    problemListUl.innerHTML = ''; // 清空现有列表

    this.problems.forEach((problem, index) => {
      const listItem = document.createElement('li');
      listItem.className = 'problem-item';
      listItem.setAttribute('data-problem-id', problem.id);

      // 添加图标
      let iconsHtml = '';
      if (problem.Code) {
        iconsHtml += `<i class="fas fa-code problem-icon code-icon" data-tooltip="已完成代码"></i>`;
      }
      if (problem.Audio) {
        iconsHtml += `<i class="fas fa-volume-up problem-icon audio-icon" data-tooltip="已录制讲解"></i>`;
      }

      listItem.innerHTML = `
        <span class="problem-title-text">${problem.shortDescription}</span>
        <span class="problem-action-icons">${iconsHtml}</span>
      `;

      // 如果是上次打开的题目，则高亮
      if (problem.id === this.appSettings.lastOpenedProblemId) {
        listItem.classList.add('active');
      }

      listItem.addEventListener('click', () => {
        this.switchToProblem(problem.id);
      });
      problemListUl.appendChild(listItem);
    });
  }

  // 切换到指定问题
  private async switchToProblem(problemId: string): Promise<void> {
    if (!this.editor) return;

    // 1. 保存当前问题的工作区状态 (如果已修改)
    if (this.currentProblemId && this.currentProblemId !== problemId) {
      await this.saveCurrentProblemToDisk();
      // 记录 problem_switched 事件 (针对上一个问题)
      this.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblemId,
        eventType: 'problem_switched',
        codeSnapshot: this.editor.getValue(),
      });
    }

    // 2. 更新当前问题ID和应用设置
    this.currentProblemId = problemId;
    this.appSettings.lastOpenedProblemId = problemId;
    await this.saveAppSettings(); // 保存最新的 lastOpenedProblemId

    // 3. 加载新问题的工作区状态
    let newProblemData = this.problemWorkspaceData.get(problemId);
    let isProblemLoadedFirstTime = false;
    if (!newProblemData) {
      isProblemLoadedFirstTime = true;
      // 如果是第一次加载此问题，初始化工作区数据
      newProblemData = {
        content: this.getWelcomeCode(), // 默认欢迎代码
        isDirty: false,
        output: '',
        audioBlob: null,
        audioUrl: null,
        filePath: null,
        audioModified: false,
      };
      this.problemWorkspaceData.set(problemId, newProblemData);

      // 尝试从本地加载代码
      const localCode = await window.electron.readProblemCode(problemId);
      if (localCode !== null) {
        newProblemData.content = localCode;
      }

      // 尝试从本地加载音频
      const audioArrayBuffer = await window.electron.readProblemAudio(problemId);
      if (audioArrayBuffer) {
        const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/webm' });
        newProblemData.audioBlob = audioBlob;
        newProblemData.audioUrl = URL.createObjectURL(audioBlob);
      }
    }

    // 更新编辑器内容
    this.suppressDirtyFlag = true; // 暂时抑制 onDidChangeModelContent 监听器
    this.editor.setValue(newProblemData.content);
    this.suppressDirtyFlag = false; // 恢复监听器
    // 更新输出区域内容
    const outputContainer = document.querySelector('.output-container') as HTMLElement;
    if (outputContainer) {
      outputContainer.innerHTML = newProblemData.output;
      outputContainer.scrollTop = outputContainer.scrollHeight;
    }

    // 更新音频面板
    this.audioChunks = newProblemData.audioBlob ? [newProblemData.audioBlob] : [];
    this.audioBlobUrl = newProblemData.audioUrl;
    this.updateAudioPanel(newProblemData.audioBlob, newProblemData.audioUrl);
    this.toggleAudioPanelVisibility(true); // 确保音频面板可见

    // 4. 更新UI元素
    this.updateProblemListSelection(problemId);
    this.updateProblemDescription(problemId); // This will also re-attach navigation button listeners
    this.updateNavigationButtons();
    this.updateTitle();
    this.activateProblemDescriptionTab(); // 激活题目描述标签页
    this.updateSaveButtonState(); // 更新保存按钮状态

    // 记录 problem_loaded 事件 (针对新加载的问题)
    if (isProblemLoadedFirstTime) {
      this.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'problem_loaded',
        codeSnapshot: newProblemData.content,
      });
    }
  }

  // 保存当前问题的工作区数据到磁盘
  private async saveCurrentProblemToDisk(): Promise<void> {
    if (!this.currentProblemId) return;
  
    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (!problemData) return;
  
    // 只有当代码或音频被修改时才保存
    if (problemData.isDirty || problemData.audioModified) {
      this.appendOutput('info', this.t('savingData'));
  
      let audioDataForMain: ArrayBuffer | null = null;
      if (problemData.audioBlob) {
        try {
          // 将 Blob 转换为 ArrayBuffer，这是可跨进程传输的
          audioDataForMain = await problemData.audioBlob.arrayBuffer();
        } catch (e) {
          console.error("Failed to convert audio Blob to ArrayBuffer:", e);
          this.appendOutput('error', `音频数据转换失败: ${e instanceof Error ? e.message : String(e)}`);
          // 即使转换失败，也尝试保存代码，并标记音频保存失败
          audioDataForMain = null;
        }
      }
  
      const success = await window.electron.saveProblemWorkspace(
        this.currentProblemId,
        problemData.content,
        audioDataForMain // 现在发送的是 ArrayBuffer 或 null
      );
  
      if (success) {
        problemData.isDirty = false;
        problemData.audioModified = false;
        this.updateTitle(); // 移除标题上的修改标记
  
        // 更新本地 problems.json 中的路径
        const problemIndex = this.problems.findIndex(p => p.id === this.currentProblemId);
        if (problemIndex !== -1) {
          const updatedProblem = { ...this.problems[problemIndex] };
          updatedProblem.Code = 'code.cpp'; // 相对路径
          updatedProblem.Audio = problemData.audioBlob ? 'audio.webm' : ''; // 如果没有音频，路径为空
  
          this.problems[problemIndex] = updatedProblem;
          await window.electron.saveProblemsToLocal(this.problems); // 保存更新后的 problems 列表
          this.renderProblemList(); // 重新渲染列表以更新图标
        }
        this.appendOutput('info', this.t('dataSaved'));
        // problem_saved 事件已在 main.ts 中成功写入文件后记录
      } else {
        this.appendOutput('error', `${this.t('saveFailed')} ${this.currentProblemId}`);
      }
    }
    this.updateSaveButtonState(); // 更新保存按钮状态
  }

  // 更新问题列表中的选中状态
  private updateProblemListSelection(problemId: string): void {
    document.querySelectorAll('.problem-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-problem-id') === problemId) {
        item.classList.add('active');
      }
    });
  }

  // 更新题目描述区域
  private updateProblemDescription(problemId: string): void {
    const problem = this.problems.find(p => p.id === problemId);
    const problemDescriptionContent = document.getElementById('problemDescriptionContent') as HTMLElement;
    if (problem && problemDescriptionContent) {
      problemDescriptionContent.innerHTML = `
        <h2>${problem.shortDescription}</h2>
        <p>${problem.fullDescription}</p>
        <div class="problem-navigation-buttons">
          <button id="prevProblemBtn" class="btn-audio" data-tooltip="${this.t('prevProblemTooltip')}">
            <i class="fas fa-arrow-left"></i> ${this.t('prevProblem')}
          </button>
          <button id="nextProblemBtn" class="btn-audio" data-tooltip="${this.t('nextProblemTooltip')}">
            ${this.t('nextProblem')} <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
      // Re-attach event listeners for navigation buttons as they are re-rendered
      document.getElementById('prevProblemBtn')?.addEventListener('click', () => this.navigateProblem(-1));
      document.getElementById('nextProblemBtn')?.addEventListener('click', () => this.navigateProblem(1));
      this.updateNavigationButtons(); // Update disabled state after re-rendering
    } else if (problemDescriptionContent) {
      problemDescriptionContent.innerHTML = `<p>${this.t('selectProblem')}</p>`;
    }
  }

  // 激活“题目描述”标签页
  private activateProblemDescriptionTab(): void {
    // 移除所有标签页和内容面板的 'active' 类
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.problem-description-panel .panel-content').forEach(content => {
      content.classList.remove('active');
    });

    // 为“题目描述”标签页和其内容面板添加 'active' 类
    document.querySelector('[data-tab-target="problem-description"]')!.classList.add('active');
    document.querySelector('[data-tab-id="problem-description"]')!.classList.add('active');
  }

  // 激活“题目列表”标签页
  private activateProblemListTab(): void {
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.problem-description-panel .panel-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelector('[data-tab-target="problem-list"]')!.classList.add('active');
    document.querySelector('[data-tab-id="problem-list"]')!.classList.add('active');
  }


  // 设置主要的DOM事件监听器
  private setupEventListeners(): void {
    // 运行按钮事件
    document.getElementById('runBtn')?.addEventListener('click', () => {
      this.executeCode(); // 点击运行按钮执行代码
    });

     // 清空输出按钮事件
    document.getElementById('clearOutputBtn')?.addEventListener('click', () => {
      this.clearOutput();  // 点击清空按钮清空输出
    });

    // 题目列表/题目描述 标签页切换
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tabHeader => {
      tabHeader.addEventListener('click', (event) => {
        const targetTab = (event.currentTarget as HTMLElement).getAttribute('data-tab-target');
        if (targetTab === 'problem-list') { // 只有题目列表可以主动点击切换
          this.activateProblemListTab();
          this.toggleAudioPanelVisibility(false); // 隐藏音频面板
        }
        // "题目描述"标签页的激活由点击题目列表项触发，这里不处理其点击事件
      });
    });

    // 音频录制和播放按钮
    document.getElementById('recordAudioBtn')?.addEventListener('click', () => this.toggleRecordAudio());
    document.getElementById('playAudioBtn')?.addEventListener('click', () => this.playAudio());

    // 用户信息输入框监听
    const userNameInput = document.getElementById('userNameInput') as HTMLInputElement;
    const studentIdInput = document.getElementById('studentIdInput') as HTMLInputElement;

    if (userNameInput) {
      userNameInput.addEventListener('input', () => {
        this.appSettings.userName = userNameInput.value;
        this.saveAppSettings();
      });
    }
    if (studentIdInput) {
      studentIdInput.addEventListener('input', () => {
        this.appSettings.studentId = studentIdInput.value;
        this.saveAppSettings();
      });
    }

    // 新增：刷新按钮
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.handleRefreshProblems());
    // 新增：导入按钮
    document.getElementById('importBtn')?.addEventListener('click', () => this.handleImportProblems());
    // 新增：保存按钮
    document.getElementById('saveBtn')?.addEventListener('click', () => this.saveCurrentProblemToDisk());
    // 新增：导出按钮
    document.getElementById('exportBtn')?.addEventListener('click', () => this.openExportModal());
  }

  // 新增：设置键盘快捷键
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', async (event) => {
      // Ctrl+S / Cmd+S for Save
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        await this.saveCurrentProblemToDisk();
      }
      // Ctrl+R / Cmd+R for Run
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        await this.executeCode();
      }
    });
  }

  // 设置终端输入框的事件监听
  private setupTerminalInput(): void {
    this.terminalInput = document.getElementById('terminalInput') as HTMLInputElement;
    if (this.terminalInput) {
      this.terminalInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && this.isProgramRunning && this.currentProblemId) { // 增加了 currentProblemId 判断
          const input = this.terminalInput!.value;
          this.appendOutput('user-input', `$&gt; ${input}`); // 在终端显示用户输入
          window.electron.sendUserInput(this.currentProblemId, input); // 发送输入到主进程，并传递 problemId
          // user_input 事件已在 main.ts 中记录
          this.terminalInput!.value = ''; // 清空输入框
          event.preventDefault(); // 阻止默认的回车行为（如表单提交）
        }
      });
    }
  }

  // 设置IPC监听器，接收主进程的实时输出
  private setupIpcListeners(): void {
    window.electron.onCppOutputChunk((chunk) => {
      this.appendOutput(chunk.type, chunk.data);
    });

    // 监听主进程发出的应用即将退出的事件
    window.electron.onBeforeQuit(async () => {
      console.log('Renderer process: Received app-before-quit event.');
      await this.saveCurrentProblemToDisk(); // 保存当前问题
      await this.saveAppSettings(); // 保存应用设置
      console.log('Renderer process: Finished saving, acknowledging quit.');
      // 通知主进程可以退出
      window.electron.sendAppQuitAcknowledged(); // 使用 window.electron 暴露的方法
    });
  }

  // 导航到上一题或下一题
  private navigateProblem(direction: -1 | 1): void {
    if (!this.currentProblemId) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblemId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < this.problems.length) {
      this.switchToProblem(this.problems[newIndex].id);
    }
  }

  // 更新上一题/下一题按钮的状态
  private updateNavigationButtons(): void {
    const prevBtn = document.getElementById('prevProblemBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextProblemBtn') as HTMLButtonElement;

    if (!prevBtn || !nextBtn || !this.currentProblemId) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblemId);

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === this.problems.length - 1;
  }

  // 更新保存按钮状态
  private updateSaveButtonState(): void {
    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    if (!saveBtn) return;

    if (!this.currentProblemId) {
      saveBtn.disabled = true;
      return;
    }

    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (problemData && (problemData.isDirty || problemData.audioModified)) {
      saveBtn.disabled = false;
    } else {
      saveBtn.disabled = true;
    }
  }

  // 执行当前激活问题中的代码
  private async executeCode(): Promise<void> {
    if (!this.editor || !this.currentProblemId) {
      this.appendOutput('error', '请先选择一个题目。');
      return;
    }

    const code = this.editor.getValue();  // 获取编辑器中的代码
    this.clearOutput();   // 清空当前问题的输出
    await this.executeCodeSafely(this.currentProblemId, code);  // 安全地执行代码，并传递 problemId
  }

  // 向输出面板追加内容
  private appendOutput(type: string, text: string): void {
    const outputContainer = document.querySelector('.output-container') as HTMLElement;  // 获取输出容器
    if (!outputContainer) return;   // 如果容器不存在则返回

    const outputLine = document.createElement('div');  // 创建新的 div 元素作为输出行
    outputLine.className = `output-${type}`;  // 添加对应类型的类名 (如 output-info, output-log, output-error, output-user-input)

    // 对于用户输入，直接显示文本；对于其他类型，将换行符转换为 <br> 标签以保留格式
    outputLine.innerHTML = type === 'user-input' ? `$&gt; ${text}` : text.replace(/\n/g, '<br>'); // 对用户输入添加 "> "前缀
    outputContainer.appendChild(outputLine);  // 将输出行添加到容器中
    outputContainer.scrollTop = outputContainer.scrollHeight;  // 滚动到最新输出

    // 同时更新工作区数据
    if (this.currentProblemId) {
      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.output = outputContainer.innerHTML; // 保存完整的HTML内容
      }
    }
  }

  // 清空当前问题的输出面板
  private clearOutput(): void {
    const outputContainer = document.querySelector('.output-container') as HTMLElement;  // 获取输出容器
    if (outputContainer) {
      outputContainer.innerHTML = '';  // 清空容器内容
    }
    if (this.terminalInput) {
      this.terminalInput.value = ''; // 清空输入框内容
    }
    // 同时更新工作区数据
    if (this.currentProblemId) {
      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.output = '';
      }
    }
  }

  // 更新窗口标题
  private updateTitle(): void {
    if (!this.currentProblemId) {
      document.title = 'DSALab';
      return;
    }
    const problem = this.problems.find(p => p.id === this.currentProblemId);
    const problemData = this.problemWorkspaceData.get(this.currentProblemId);

    if (problem && problemData) {
      const title = `${problem.shortDescription}${problemData.isDirty || problemData.audioModified ? ' •' : ''} - DSALab`;
      document.title = title;
    } else {
      document.title = 'DSALab';
    }
  }

  private async executeCodeSafely(problemId: string, code: string): Promise<void> {
    // 启动程序前，设置程序运行状态，并启用输入框
    this.isProgramRunning = true;
    if (this.terminalInput) {
      this.terminalInput.disabled = false;
      this.terminalInput.focus(); // 自动聚焦到输入框
    }

    try {
      // 调用主进程编译并运行 C++ 代码。
      // 主进程会通过 'cpp-output-chunk' IPC 通道实时发送输出和错误。
      // run_start, run_end, compile_error, run_timeout 等事件已在 main.ts 中记录。
      const result = await window.electron.compileAndRunCpp(problemId, code, this.EXECUTION_TIMEOUT);

      // 程序执行结束后，根据最终结果更新状态
      if (!result.success && !result.error && !result.output) {
          // 如果主进程没有发送任何特殊的结束消息，这里可以添加一个通用结束提示
          // 但通常主进程会发送错误或成功消息
      }

    } catch (error: any) {
      // 捕获 IPC 调用本身的错误，而不是C++程序内部的错误
      this.appendFriendlyError(error);
    } finally {
      // 程序执行结束（无论成功失败或超时），禁用输入框
      this.isProgramRunning = false;
      if (this.terminalInput) {
        this.terminalInput.disabled = true;
        this.terminalInput.value = ''; // 清空输入框中可能残留的文本
      }
    }
  }

  private appendFriendlyError(error: Error): void {
    const outputContainer = document.querySelector('.output-container') as HTMLElement;
    if (!outputContainer) return;

    const errorLine = document.createElement('div');
    errorLine.className = 'output-error-friendly';

    let friendlyMessage = '';

    // Make error messages more friendly
    if (error.message.includes('Compilation failed')) {
      if (error.message.includes('g++ compiler not found')) {
        friendlyMessage = `❌ ${this.t('compilerNotFound')}：${error.message.replace('Compilation failed: g++ compiler not found or not in PATH.', '').trim()}\n请确保你的系统已安装 g++ 编译器，并且在 PATH 中可访问。`;
      } else {
        friendlyMessage = `❌ ${this.t('compilationFailed')}：请检查你的C++语法错误。\n详细信息: ${error.message}`;
      }
    } else if (error.message.includes('Execution timed out')) {
      friendlyMessage = `⚠️ ${this.t('executionTimedOut')}：你的程序运行时间过长，可能存在无限循环或性能问题 (超过 ${this.EXECUTION_TIMEOUT / 1000} 秒)。\n详细信息: ${error.message}`;
    } else if (error.message.includes('Execution failed')) {
      friendlyMessage = `❌ ${this.t('runtimeError')}：程序执行失败。\n详细信息: ${error.message}`;
    } else if (error.message.includes('Previous program was forcefully terminated')) {
      friendlyMessage = `⚠️ ${this.t('previousProgramTerminated')}`;
    } else if (error.message.includes('No program is currently running to receive input')) {
      friendlyMessage = `❌ ${this.t('noProgramToReceiveInput')}`;
    } else {
      friendlyMessage = `❌ ${this.t('error')}: ${error.message}`;
    }

    errorLine.innerHTML = friendlyMessage.replace(/\n/g, '<br>');
    outputContainer.appendChild(errorLine);
    outputContainer.scrollTop = outputContainer.scrollHeight;

    // 同时更新工作区数据
    if (this.currentProblemId) {
      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.output = outputContainer.innerHTML;
      }
    }
  }

  // 国际化翻译函数
  private t(key: keyof typeof this.translations.en, replacements?: { [key: string]: string | number }): string {
    const lang = this.currentLanguage as 'en' | 'zh';
    let text = this.translations[lang][key] || key;
    if (replacements) {
      for (const rKey in replacements) {
        text = text.replace(`{${rKey}}`, String(replacements[rKey]));
      }
    }
    return text;
  }

  // 切换录音状态
  private async toggleRecordAudio(): Promise<void> {
    const recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;
    const playBtn = document.getElementById('playAudioBtn') as HTMLButtonElement;
    const audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;

    if (!recordBtn || !playBtn || !audioPlayback || !this.currentProblemId) return;
    const problemData = this.problemWorkspaceData.get(this.currentProblemId)!;

    if (!this.isRecording) {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl); // Revoke previous URL to prevent memory leaks
          }
          this.audioBlobUrl = URL.createObjectURL(audioBlob);
          audioPlayback.src = this.audioBlobUrl;
          playBtn.disabled = false;
          audioPlayback.style.display = 'block';

          // Save to current problem's workspace
          problemData.audioBlob = audioBlob;
          problemData.audioUrl = this.audioBlobUrl;
          problemData.audioModified = true; // 标记音频已修改
          this.updateTitle();
          this.updateSaveButtonState(); // 更新保存按钮状态

          // 记录 audio_record_stop 事件
          this.recordHistoryEvent({
            timestamp: Date.now(),
            problemId: this.currentProblemId!,
            eventType: 'audio_record_stop',
            durationMs: this.recordingStartTime ? Date.now() - this.recordingStartTime : undefined, // 使用记录的开始时间
            audioSizeKB: Math.round(audioBlob.size / 1024),
          });
          this.recordingStartTime = null; // 录制结束后清除开始时间
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.recordingStartTime = Date.now(); // 记录录制开始时间
        recordBtn.innerHTML = `<i class="fas fa-stop"></i> ${this.t('recordAudio')}`; // Change text to "Stop"
        recordBtn.classList.add('recording'); // Add a class for visual feedback
        playBtn.disabled = true; // Disable play during recording
        audioPlayback.style.display = 'none'; // Hide audio player during recording
        audioPlayback.src = ''; // Clear source
        this.appendOutput('info', this.t('recordingStarted'));

        // 记录 audio_record_start 事件
        this.recordHistoryEvent({
          timestamp: Date.now(),
          problemId: this.currentProblemId!,
          eventType: 'audio_record_start',
        });
      } catch (err) {
        console.error(this.t('microphoneAccessFailed'), err);
        this.appendOutput('error', `${this.t('microphoneAccessFailed')}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Stop recording
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop()); // Stop microphone access
      this.isRecording = false;
      this.recordingStartTime = null; // 停止录制时清除开始时间
      recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`; // Change text back to "Record"
      recordBtn.classList.remove('recording');
      this.appendOutput('info', this.t('recordingStopped'));
      // audio_record_stop 事件已在 mediaRecorder.onstop 中记录
    }
  }

  // 播放录音
  private playAudio(): void {
    const audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;
    if (audioPlayback && audioPlayback.src && this.currentProblemId) {
      audioPlayback.play().then(() => {
        // 记录 audio_play 事件
        this.recordHistoryEvent({
          timestamp: Date.now(),
          problemId: this.currentProblemId!,
          eventType: 'audio_play',
          durationMs: audioPlayback.duration * 1000, // 持续时间 (毫秒)
        });
      }).catch(e => {
        console.error(this.t('playbackFailed'), e);
        this.appendOutput('error', `${this.t('playbackFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  }

  // 更新音频面板的UI状态
  private updateAudioPanel(audioBlob: Blob | null, audioUrl: string | null): void {
    const playBtn = document.getElementById('playAudioBtn') as HTMLButtonElement;
    const audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;
    const recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;

    if (!playBtn || !audioPlayback || !recordBtn) return;

    if (audioBlob && audioUrl) {
      audioPlayback.src = audioUrl;
      playBtn.disabled = false;
      audioPlayback.style.display = 'block';
    } else {
      audioPlayback.src = '';
      playBtn.disabled = true;
      audioPlayback.style.display = 'none';
    }

    // Reset recording button state
    this.isRecording = false;
    recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`;
    recordBtn.classList.remove('recording');
  }

  // 新增：控制音频面板的整体可见性
  private toggleAudioPanelVisibility(show: boolean): void {
    const audioPanel = document.querySelector('.audio-panel') as HTMLElement;
    if (audioPanel) {
      if (show) {
        audioPanel.classList.remove('hidden');
      } else {
        audioPanel.classList.add('hidden');
      }
    }
  }

  // ----------------------------------------------------
  // 新增：记录历史事件的辅助方法
  // ----------------------------------------------------
  private recordHistoryEvent(event: HistoryEvent): void {
    if (!this.currentProblemId && event.eventType !== 'problem_loaded') { // problem_loaded 可以在 currentProblemId 刚设置时触发
      console.warn('Attempted to record history event without a currentProblemId:', event);
      return;
    }
    window.electron.recordHistoryEvent(event);
  }

  // --- Splitter Logic ---
  private setupSplitters(): void {
    this.mainSplitter = document.querySelector('.main-split-divider');
    // this.leftPanelHorizontalSplitter = document.querySelector('.problem-description-panel > .horizontal-split-divider'); // 移除
    this.rightPanelHorizontalSplitter = document.querySelector('.code-test-panel > .horizontal-split-divider');

    this.problemDescriptionPanel = document.querySelector('.problem-description-panel');
    this.codeTestPanel = document.querySelector('.code-test-panel');
    // this.problemContentArea = document.querySelector('.problem-description-panel .panel-content.active'); // 不再需要动态获取
    this.audioPanel = document.querySelector('.audio-panel');
    this.editorContainer = document.querySelector('.editor-container');
    this.testOutputArea = document.querySelector('.test-output-area');
    this.problemPanelTabs = document.querySelector('.problem-panel-tabs');


    if (this.mainSplitter) {
      this.mainSplitter.addEventListener('mousedown', this.startDragMainSplitter);
    }
    if (this.rightPanelHorizontalSplitter) {
      this.rightPanelHorizontalSplitter.addEventListener('mousedown', this.startDragRightHorizontalSplitter);
    }
  }

  private startDragMainSplitter = (e: MouseEvent) => {
    e.preventDefault();
    this.isDraggingMainSplitter = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
    document.addEventListener('mousemove', this.dragMainSplitter);
    document.addEventListener('mouseup', this.stopDragMainSplitter);
  };

  private dragMainSplitter = (e: MouseEvent) => {
    if (!this.isDraggingMainSplitter || !this.problemDescriptionPanel || !this.codeTestPanel) return;

    const workspace = document.querySelector('.workspace') as HTMLElement;
    if (!workspace) return;

    const workspaceRect = workspace.getBoundingClientRect();
    let newLeftPanelWidth = e.clientX - workspaceRect.left;

    // Minimum width constraints
    const minLeftWidth = 250; // Minimum width for problem panel
    const minRightWidth = 350; // Minimum width for code/output panel
    const maxLeftWidth = workspaceRect.width - minRightWidth;

    newLeftPanelWidth = Math.max(minLeftWidth, Math.min(newLeftPanelWidth, maxLeftWidth));

    this.problemDescriptionPanel.style.flexBasis = `${newLeftPanelWidth}px`;
    this.codeTestPanel.style.flexBasis = `${workspaceRect.width - newLeftPanelWidth - (this.mainSplitter?.offsetWidth || 0)}px`;

    this.editor?.layout(); // Re-layout Monaco Editor after resize
  };

  private stopDragMainSplitter = () => {
    this.isDraggingMainSplitter = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
    document.removeEventListener('mousemove', this.dragMainSplitter);
    document.removeEventListener('mouseup', this.stopDragMainSplitter);
  };


  private startDragRightHorizontalSplitter = (e: MouseEvent) => {
    e.preventDefault();
    this.isDraggingRightHorizontalSplitter = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', this.dragRightHorizontalSplitter);
    document.addEventListener('mouseup', this.stopDragRightHorizontalSplitter);
  };

  private dragRightHorizontalSplitter = (e: MouseEvent) => {
    if (!this.isDraggingRightHorizontalSplitter || !this.codeTestPanel || !this.editorContainer || !this.testOutputArea) return;

    const codeTestPanelRect = this.codeTestPanel.getBoundingClientRect();
    const headerHeight = (document.querySelector('.code-test-panel > .panel-header') as HTMLElement)?.offsetHeight || 0;
    let newEditorHeight = e.clientY - codeTestPanelRect.top - headerHeight;

    // Minimum height constraints
    const minEditorHeight = 150;
    const minOutputAreaHeight = 150;
    const maxEditorHeight = codeTestPanelRect.height - headerHeight - minOutputAreaHeight - (this.rightPanelHorizontalSplitter?.offsetHeight || 0);

    newEditorHeight = Math.max(minEditorHeight, Math.min(newEditorHeight, maxEditorHeight));

    this.editorContainer.style.flexBasis = `${newEditorHeight}px`;
    this.testOutputArea.style.flexBasis = `${codeTestPanelRect.height - headerHeight - newEditorHeight - (this.rightPanelHorizontalSplitter?.offsetHeight || 0)}px`;

    this.editor?.layout(); // Re-layout Monaco Editor after resize
  };

  private stopDragRightHorizontalSplitter = () => {
    this.isDraggingRightHorizontalSplitter = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
    document.removeEventListener('mousemove', this.dragRightHorizontalSplitter);
    document.removeEventListener('mouseup', this.stopDragRightHorizontalSplitter);
  };


  private getWelcomeCode(): string {
    return `// 欢迎来到 DSALab! 🚀

#include <iostream>
#include <string>

int main() {
    std::cout << "Hello DSALab!" << std::endl;
    std::cout << "请输入你的名字: ";
    std::string name;
    std::cin >> name;
    std::cout << "你好, " << name << "!" << std::endl;
    std::cout << "再见!" << std::endl;
    return 0;
}
`;
  }

  // --- 新增：刷新题目列表功能 ---
  private async handleRefreshProblems(): Promise<void> {
    const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('loading'); // 添加加载动画类
    }

    try {
      // 提示用户保存当前题目（如果已修改）
      if (this.currentProblemId) {
        await this.saveCurrentProblemToDisk();
      }

      this.problems = await window.electron.refreshProblems();
      this.renderProblemList();
      this.appendOutput('info', this.t('refreshSuccess'));

      // 刷新后尝试重新激活上次打开的题目或当前题目
      if (this.currentProblemId) {
        const problemExists = this.problems.some(p => p.id === this.currentProblemId);
        if (problemExists) {
          await this.switchToProblem(this.currentProblemId);
        } else {
          // 当前题目已不存在，重置状态
          this.currentProblemId = null;
          this.appSettings.lastOpenedProblemId = null;
          await this.saveAppSettings();
          this.editor?.setValue(this.t('selectProblemEditor'));
          this.clearOutput();
          this.toggleAudioPanelVisibility(false);
          this.updateTitle();
          this.updateSaveButtonState();
          this.activateProblemListTab();
        }
      } else if (this.appSettings.lastOpenedProblemId) {
        const lastProblem = this.problems.find(p => p.id === this.appSettings.lastOpenedProblemId);
        if (lastProblem) {
          await this.switchToProblem(lastProblem.id);
        }
      } else {
        this.editor?.setValue(this.t('selectProblemEditor'));
        this.clearOutput();
        this.toggleAudioPanelVisibility(false);
        this.updateTitle();
        this.updateSaveButtonState();
        this.activateProblemListTab();
      }

    } catch (error) {
      console.error(this.t('refreshFailed'), error);
      this.appendOutput('error', `${this.t('refreshFailed')} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
      }
    }
  }

  // --- 新增：导入题目列表功能 ---
  private async handleImportProblems(): Promise<void> {
    // 提示用户保存当前题目（如果已修改）
    if (this.currentProblemId) {
      await this.saveCurrentProblemToDisk();
    }

    try {
      const result = await window.electron.showOpenDialog([
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]);

      if (result && result.content) {
        const importResult = await window.electron.importProblems(result.content);

        if (importResult.success && importResult.problems) {
          this.problems = importResult.problems;
          this.renderProblemList();
          this.appendOutput('info', this.t('importSuccess', { count: importResult.problems.length - (importResult.invalidCount || 0), invalidCount: importResult.invalidCount || 0 }));
          // 导入成功后，尝试重新激活上次打开的题目或当前题目
          if (this.currentProblemId) {
            const problemExists = this.problems.some(p => p.id === this.currentProblemId);
            if (problemExists) {
              await this.switchToProblem(this.currentProblemId);
            } else {
              // 当前题目已不存在，重置状态
              this.currentProblemId = null;
              this.appSettings.lastOpenedProblemId = null;
              await this.saveAppSettings();
              this.editor?.setValue(this.t('selectProblemEditor'));
              this.clearOutput();
              this.toggleAudioPanelVisibility(false);
              this.updateTitle();
              this.updateSaveButtonState();
              this.activateProblemListTab();
            }
          } else if (this.appSettings.lastOpenedProblemId) {
            const lastProblem = this.problems.find(p => p.id === this.appSettings.lastOpenedProblemId);
            if (lastProblem) {
              await this.switchToProblem(lastProblem.id);
            }
          } else {
            this.editor?.setValue(this.t('selectProblemEditor'));
            this.clearOutput();
            this.toggleAudioPanelVisibility(false);
            this.updateTitle();
            this.updateSaveButtonState();
            this.activateProblemListTab();
          }
        } else {
          this.appendOutput('error', `${this.t('importFailed')} ${importResult.error || this.t('importInvalidFormat')}`);
        }
      } else {
        this.appendOutput('info', '导入已取消。');
      }
    } catch (error) {
      console.error(this.t('importFailed'), error);
      this.appendOutput('error', `${this.t('importFailed')} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- 新增：导出题目到ZIP功能 (弹窗及逻辑) ---
  private setupExportModal(): void {
    this.exportModal = document.getElementById('exportModal');
    this.exportProblemList = document.getElementById('exportProblemList') as HTMLUListElement;
    this.cancelExportBtn = document.getElementById('cancelExportBtn') as HTMLButtonElement;
    this.confirmExportBtn = document.getElementById('confirmExportBtn') as HTMLButtonElement;
    this.closeExportModalBtn = this.exportModal?.querySelector('.close-button') as HTMLElement;

    this.cancelExportBtn?.addEventListener('click', () => this.closeExportModal());
    this.closeExportModalBtn?.addEventListener('click', () => this.closeExportModal());
    this.confirmExportBtn?.addEventListener('click', () => this.handleConfirmExport());

    // Close modal if clicking outside content
    this.exportModal?.addEventListener('click', (e) => {
      if (e.target === this.exportModal) {
        this.closeExportModal();
      }
    });
  }

  private openExportModal(): void {
    if (!this.exportModal || !this.exportProblemList) return;

    // 提示用户保存当前题目（如果已修改）
    if (this.currentProblemId) {
      this.saveCurrentProblemToDisk(); // 不等待，异步保存
    }

    this.exportProblemList.innerHTML = ''; // Clear previous list

    this.problems.forEach(problem => {
      const listItem = document.createElement('li');
      listItem.className = 'export-problem-item';
      listItem.setAttribute('data-problem-id', problem.id);

      const hasCode = problem.Code !== '';
      const hasAudio = problem.Audio !== '';
      const canExport = hasCode && hasAudio;

      let tooltipText = '';
      if (!canExport) {
        tooltipText = this.t('missingCodeAudio');
        if (!hasCode) tooltipText += ' (缺少代码)';
        if (!hasAudio) tooltipText += ' (缺少音频)';
        listItem.classList.add('disabled-problem');
      }

      listItem.innerHTML = `
        <label data-tooltip="${tooltipText}">
          <input type="checkbox" data-problem-id="${problem.id}" ${!canExport ? 'disabled' : ''} ${problem.id === this.currentProblemId ? 'checked' : ''}>
          <span>${problem.shortDescription}</span>
        </label>
      `;

      if (problem.id === this.currentProblemId) {
        listItem.classList.add('active-problem');
      }

      this.exportProblemList?.appendChild(listItem);
    });

    this.exportModal.classList.remove('hidden');
  }

  private closeExportModal(): void {
    this.exportModal?.classList.add('hidden');
  }

  private async handleConfirmExport(): Promise<void> {
    if (!this.exportProblemList) return;

    const selectedProblemIds: string[] = [];
    this.exportProblemList.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)').forEach(checkbox => {
      selectedProblemIds.push((checkbox as HTMLInputElement).dataset.problemId!);
    });

    if (selectedProblemIds.length === 0) {
      this.appendOutput('info', '请选择至少一个题目进行导出。');
      return;
    }

    this.closeExportModal();
    this.appendOutput('info', '正在准备导出...');

    try {
      const date = new Date();
      const defaultFileName = `DSALab_Export_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}.zip`;

      const result = await window.electron.exportProblemsToZip(selectedProblemIds, defaultFileName);

      if (result.success && result.filePath) {
        this.appendOutput('result', `${this.t('exportSuccess')} ${result.filePath}`);
      } else {
        this.appendOutput('error', `${this.t('exportFailed')} ${result.message || '未知错误'}`);
      }
    } catch (error) {
      console.error(this.t('exportFailed'), error);
      this.appendOutput('error', `${this.t('exportFailed')} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DSALabApp());
} else {
  new DSALabApp();
}