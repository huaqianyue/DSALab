// renderer.ts
/**
 * DSALab - C++ Playground
 */

import './index.css'; //导入主样式文件，应用于整个应用程序的UI

// Monaco Editor imports
import * as monaco from 'monaco-editor';

// 声明全局的'electron'API，这个API由Electron的preload.ts脚本暴露给渲染进程。
//这是渲染进程与主进程进行通信（IPC）的关键接口。
declare global {
  interface Window {
    electron: {
      /**
       * 调用主进程编译并运行 C++ 代码。
       * @param code 要编译和运行的 C++ 代码字符串。
       * @param timeout 执行超时时间（毫秒）。
       * @returns 一个 Promise，包含执行结果：success（是否成功）、output（标准输出）、error（错误信息）。
       */
      compileAndRunCpp: (code: string, timeout: number) => Promise<{ success: boolean; output: string; error: string }>;
      /**
       * 调用主进程显示一个打开文件对话框。
       * @returns 一个 Promise，包含选定文件的路径和内容，如果用户取消则返回 null。
       */
      showOpenDialog: () => Promise<{ filePath: string; content: string } | null>;
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
       * @param input 用户输入的字符串。
       */
      sendUserInput: (input: string) => void;
    };
  }
}

// DSALab Application Class
//定义应用程序的设置接口
interface AppSettings {
  theme: string;  //编辑器主题
  fontSize: number;  //字体大小
  wordWrap: boolean; //自动换行
  minimap: boolean;  //是否显示小地图
  lineNumbers: boolean; //是否显示行号
  tabSize: number; //Tab键对应的空格数
  fontFamily: string; //字体家族
  language: string;  //UI语言（en，zh）
}

//定义主题的结构接口
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

// 定义问题数据结构
interface Problem {
  id: string;
  shortDescription: string;
  fullDescription: string;
}

// 定义每个问题的工作区数据结构
interface ProblemWorkspaceData {
  content: string;
  isDirty: boolean;
  output: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  filePath: string | null;
}


// DSALab 应用程序的主类，负责整个前端应用的逻辑和状态
class DSALabApp {
  // 单个 Monaco Editor 实例
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  // 存储所有问题数据
  private problems: Problem[] = [];
  // 当前激活的问题ID
  private currentProblemId: string | null = null;
  // 存储每个问题的工作区数据
  private problemWorkspaceData: Map<string, ProblemWorkspaceData> = new Map();

  // 代码执行的最大超时时间（30秒）。
  private readonly EXECUTION_TIMEOUT = 30000; 
  // 应用程序的当前设置，包含默认值。
  private settings: AppSettings = {
    theme: 'github-dark',  // 默认主题
    fontSize: 14,  // 默认字体大小
    wordWrap: true,  // 默认自动换行
    minimap: false,  // 默认不显示小地图
    lineNumbers: true,  // 默认显示行号
    tabSize: 2,  // 默认 Tab 大小
    fontFamily: 'JetBrains Mono',   // 默认字体家族
    language: 'zh' // 默认语言为中文
  };
  // 定义可用的主题列表
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
  // 定义可用的字体家族列表
  private fontFamilies = [
    'JetBrains Mono',
    'Fira Code',
    'Consolas',
    'Monaco',
    'Menlo'
  ];
  // 应用程序的国际化翻译文本
  private translations = {
    en: {
      file: 'File',
      settings: 'Settings',
      theme: 'Theme',
      fontSize: 'Font Size',
      fontFamily: 'Font Family',
      language: 'Language',
      lineNumbers: 'Line Numbers',
      run: 'Run',
      clear: 'Clear',
      export: 'Export', // New translation
      recordAudio: 'Record Audio', // New translation
      playAudio: 'Play Audio', // New translation
      prevProblem: 'Previous Problem', // New translation
      nextProblem: 'Next Problem', // New translation
      // Tooltips
      runTooltip: 'Run (Ctrl+R)',
      clearTooltip: 'Clear output',
      settingsTooltip: 'Settings',
      exportTooltip: 'Export current problem code and audio', // New tooltip
      recordAudioTooltip: 'Record audio explanation', // New tooltip
      playAudioTooltip: 'Play recorded audio', // New tooltip
      prevProblemTooltip: 'Go to previous problem', // New tooltip
      nextProblemTooltip: 'Go to next problem', // New tooltip
      confirmSaveOnClose: 'Do you want to save changes to', // 关闭时确认保存的提示
    },
    zh: { // 中文翻译
      file: '文件',
      settings: '设置',
      theme: '主题',
      fontSize: '字体大小',
      fontFamily: '字体家族',
      language: '语言',
      lineNumbers: '行号',
      run: '运行',
      clear: '清空',
      export: '导出', // New translation
      recordAudio: '录制', // New translation
      playAudio: '播放', // New translation
      prevProblem: '前一题', // New translation
      nextProblem: '后一题', // New translation
      // Tooltips
      runTooltip: '运行 (Ctrl+R)',
      clearTooltip: '清空输出',
      settingsTooltip: '设置',
      exportTooltip: '导出当前题目代码和讲解音频', // New tooltip
      recordAudioTooltip: '录制音频讲解', // New tooltip
      playAudioTooltip: '播放录制音频', // New tooltip
      prevProblemTooltip: '切换到上一题', // New tooltip
      nextProblemTooltip: '切换到下一题', // New tooltip
      confirmSaveOnClose: '是否保存', 
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


  // 构造函数，应用程序初始化时调用
  constructor() {
    this.initializeMonacoTheme(); // 初始化 Monaco Editor 主题
    this.createEditor(); // 创建单个编辑器实例
    this.fetchProblemsAndInitializeUI();  // 获取问题并初始化UI
    this.setupEventListeners();  // 设置DOM事件监听器
    this.setupTerminalInput(); // 新增：设置终端输入
    this.setupIpcListeners(); // 新增：设置IPC监听器
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
      value: this.getWelcomeCode(),  // 初始内容为欢迎代码
      language: 'cpp', // 语言模式设置为 C++
      theme: this.settings.theme,  // 应用当前设置的主题
      fontSize: this.settings.fontSize,  // 应用当前设置的字体大小
      fontFamily: this.settings.fontFamily,  // 应用当前设置的字体家族
      minimap: { enabled: this.settings.minimap },  // 根据设置启用/禁用小地图
      scrollBeyondLastLine: false,  // 不允许滚动到最后一行之外
      automaticLayout: true,  // 自动布局，适应容器大小变化
      tabSize: this.settings.tabSize,  // 应用当前设置的 Tab 大小
      insertSpaces: true,  // 使用空格代替 Tab 键
      wordWrap: this.settings.wordWrap ? 'on' : 'off',  // 根据设置启用/禁用自动换行
      lineNumbers: this.settings.lineNumbers ? 'on' : 'off',  // 根据设置启用/禁用行号
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

    // 监听编辑器内容变化，更新当前问题工作区的“已修改”状态
    this.editor.onDidChangeModelContent(() => {
      if (this.currentProblemId) {
        const problemData = this.problemWorkspaceData.get(this.currentProblemId);
        if (problemData) {
          problemData.isDirty = true;  // 设置为已修改
          problemData.content = this.editor!.getValue();  // 更新内容
          this.updateTitle();  // 更新窗口标题以显示修改状态
        }
      }
    });
  }

  // 异步获取问题列表并初始化UI
  private async fetchProblemsAndInitializeUI(): Promise<void> {
    try {
      const response = await fetch('https://cdn.jsdmirror.com/gh/huaqianyue/DSALab/problem.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.problems = await response.json();
      this.renderProblemList(); // 渲染问题列表

      if (this.problems.length > 0) {
        // 默认加载第一个问题
        this.switchToProblem(this.problems[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch problems:', error);
      const problemListContent = document.querySelector('.problem-list-content') as HTMLElement;
      if (problemListContent) {
        problemListContent.innerHTML = `<p style="color: red;">加载题目失败: ${error instanceof Error ? error.message : String(error)}</p>`;
      }
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
      listItem.textContent = problem.shortDescription;
      listItem.addEventListener('click', () => {
        this.switchToProblem(problem.id);
      });
      problemListUl.appendChild(listItem);
    });
  }

  // 切换到指定问题
  private switchToProblem(problemId: string): void {
    if (!this.editor) return;

    // 1. 保存当前问题的工作区状态
    if (this.currentProblemId && this.problemWorkspaceData.has(this.currentProblemId)) {
      const currentProblemData = this.problemWorkspaceData.get(this.currentProblemId)!;
      currentProblemData.content = this.editor.getValue();
      currentProblemData.output = document.querySelector('.output-container')?.innerHTML || '';
      // Only save audio if chunks exist (i.e., something was recorded)
      currentProblemData.audioBlob = this.audioChunks.length > 0 ? new Blob(this.audioChunks, { type: 'audio/webm' }) : null;
      currentProblemData.audioUrl = this.audioBlobUrl;
    }

    // 2. 更新当前问题ID
    this.currentProblemId = problemId;

    // 3. 加载新问题的工作区状态
    let newProblemData = this.problemWorkspaceData.get(problemId);
    if (!newProblemData) {
      // 如果是第一次加载此问题，初始化工作区数据
      newProblemData = {
        content: this.getWelcomeCode(),
        isDirty: false,
        output: '',
        audioBlob: null,
        audioUrl: null,
        filePath: null,
      };
      this.problemWorkspaceData.set(problemId, newProblemData);
    }

    // 更新编辑器内容
    this.editor.setValue(newProblemData.content);
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
    
    // 4. 更新UI元素
    this.updateProblemListSelection(problemId);
    this.updateProblemDescription(problemId); // This will also re-attach navigation button listeners
    this.updateNavigationButtons();
    this.updateTitle();
    this.activateProblemDescriptionTab(); // 激活题目描述标签页
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
          document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tab => tab.classList.remove('active'));
          document.querySelectorAll('.problem-description-panel .panel-content').forEach(content => content.classList.remove('active'));

          document.querySelector(`[data-tab-target="problem-list"]`)!.classList.add('active');
          document.querySelector(`[data-tab-id="problem-list"]`)!.classList.add('active');
        }
        // "题目描述"标签页的激活由点击题目列表项触发，这里不处理其点击事件
      });
    });

    // 音频录制和播放按钮
    document.getElementById('recordAudioBtn')?.addEventListener('click', () => this.toggleRecordAudio());
    document.getElementById('playAudioBtn')?.addEventListener('click', () => this.playAudio());
  }

  // 新增：设置终端输入框的事件监听
  private setupTerminalInput(): void {
    this.terminalInput = document.getElementById('terminalInput') as HTMLInputElement;
    if (this.terminalInput) {
      this.terminalInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && this.isProgramRunning) {
          const input = this.terminalInput!.value;
          this.appendOutput('user-input', `$&gt; ${input}`); // 在终端显示用户输入
          window.electron.sendUserInput(input); // 发送输入到主进程
          this.terminalInput!.value = ''; // 清空输入框
          event.preventDefault(); // 阻止默认的回车行为（如表单提交）
        }
      });
    }
  }

  // 新增：设置IPC监听器，接收主进程的实时输出
  private setupIpcListeners(): void {
    window.electron.onCppOutputChunk((chunk) => {
      this.appendOutput(chunk.type, chunk.data);
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

  // 执行当前激活问题中的代码
  private async executeCode(): Promise<void> {
    if (!this.editor || !this.currentProblemId) return;

    const code = this.editor.getValue();  // 获取编辑器中的代码
    this.clearOutput();   // 清空当前问题的输出
    await this.executeCodeSafely(this.currentProblemId, code);  // 安全地执行代码
  }

  // 向输出面板追加内容
  private appendOutput(type: string, text: string): void {
    const outputContainer = document.querySelector('.output-container') as HTMLElement;  // 获取输出容器
    if (!outputContainer) return;   // 如果容器不存在则返回

    const outputLine = document.createElement('div');  // 创建新的 div 元素作为输出行
    outputLine.className = `output-${type}`;  // 添加对应类型的类名 (如 output-info, output-log, output-error, output-user-input)
    
    // 对于用户输入，直接显示文本；对于其他类型，将换行符转换为 <br> 标签以保留格式
    outputLine.innerHTML = type === 'user-input' ? text : text.replace(/\n/g, '<br>');
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
      const title = `${problem.shortDescription}${problemData.isDirty ? ' •' : ''} - DSALab`;
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
      // 此处的 await 仅等待整个 C++ 程序的生命周期结束（包括编译和执行）。
      const result = await window.electron.compileAndRunCpp(code, this.EXECUTION_TIMEOUT);

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

    // 清除 "正在编译并运行C++代码..." 如果它是最后一条消息
    // （在实时输出模式下，这条可能由主进程发送，但为了健壮性保留）
    if (outputContainer.lastElementChild?.textContent?.includes('正在编译并运行C++代码...')) {
      outputContainer.removeChild(outputContainer.lastElementChild);
    }

    const errorLine = document.createElement('div');
    errorLine.className = 'output-error-friendly';
    
    let friendlyMessage = '';
    
    // Make error messages more friendly
    if (error.message.includes('Compilation failed')) {
      friendlyMessage = `❌ 编译失败：请检查你的C++语法错误。\n${error.message}`;
    } else if (error.message.includes('Execution timed out')) {
      friendlyMessage = `⚠️ 执行超时：你的程序运行时间过长，可能存在无限循环或性能问题。\n${error.message}`;
    } else if (error.message.includes('Execution failed')) {
      friendlyMessage = `❌ 运行时错误：程序执行失败。\n${error.message}`;
    } else if (error.message.includes('g++')) {
      friendlyMessage = `❌ 编译器错误：请确保你的系统已安装 g++ 编译器，并且在 PATH 中可访问。\n${error.message}`;
    } else {
      friendlyMessage = `❌ 错误: ${error.message}`;
    }
    
    errorLine.innerHTML = friendlyMessage;
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
  private t(key: string): string {
    const lang = this.settings.language as 'en' | 'zh';
    return this.translations[lang][key as keyof typeof this.translations.en] || key;
  }

  // 切换录音状态
  private async toggleRecordAudio(): Promise<void> {
    const recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;
    const playBtn = document.getElementById('playAudioBtn') as HTMLButtonElement;
    const audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;

    if (!recordBtn || !playBtn || !audioPlayback) return;

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
          if (this.currentProblemId) {
            const problemData = this.problemWorkspaceData.get(this.currentProblemId);
            if (problemData) {
              problemData.audioBlob = audioBlob;
              problemData.audioUrl = this.audioBlobUrl;
            }
          }
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        recordBtn.innerHTML = `<i class="fas fa-stop"></i> 停止`;
        recordBtn.classList.add('recording'); // Add a class for visual feedback
        playBtn.disabled = true; // Disable play during recording
        audioPlayback.style.display = 'none'; // Hide audio player during recording
        audioPlayback.src = ''; // Clear source
        this.appendOutput('info', '开始录制音频...');
      } catch (err) {
        console.error('无法访问麦克风:', err);
        this.appendOutput('error', `无法录制音频: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Stop recording
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop()); // Stop microphone access
      this.isRecording = false;
      recordBtn.innerHTML = `<i class="fas fa-microphone"></i> 录制`;
      recordBtn.classList.remove('recording');
      this.appendOutput('info', '录制结束。');
    }
  }

  // 播放录音
  private playAudio(): void {
    const audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;
    if (audioPlayback && audioPlayback.src) {
      audioPlayback.play().catch(e => console.error('播放音频失败:', e));
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
    recordBtn.innerHTML = `<i class="fas fa-microphone"></i> 录制`;
    recordBtn.classList.remove('recording');
  }

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
}

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DSALabApp());
} else {
  new DSALabApp();
}