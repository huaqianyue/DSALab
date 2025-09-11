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

// DSALab 应用程序的主类，负责整个前端应用的逻辑和状态
class DSALabApp {
  //存储所有Monaco编辑器实例的Map，键为标签页ID，值为编辑器实例
  private editors: Map<string, monaco.editor.IStandaloneCodeEditor> = new Map();
  //用于生成新标签页ID的计数器
  private tabCounter = 1;
  //当前激活的标签页ID
  private activeTabId = 'tab-1';
  //存储所有标签页的数据，包括标题、内容、是否修改、文件路径等。
  private tabData: Map<string, { title: string; content: string; isDirty: boolean; file: string | null }> = new Map();
  // 代码执行的最大超时时间（30秒）。
  private readonly EXECUTION_TIMEOUT = 30000; 
  // private readonly MAX_OUTPUT_LINES = 1000; // Maximum 1000 lines of output
  // private executionAbortController: Map<string, AbortController> = new Map();
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
  private readonly SETTINGS_KEY = 'DSALab-settings'; // 用于在 localStorage 中存储设置的键名。
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
      // Tooltips
      runTooltip: 'Run (Ctrl+R)',
      clearTooltip: 'Clear output (Ctrl+K)',
      settingsTooltip: 'Settings',
      confirmSaveOnClose: 'Do you want to save changes to', // 关闭时确认保存的提示
      // 设置面板相关
      general: 'General',
      appearance: 'Appearance',
      editor: 'Editor',
      font: 'Font',
      tabSize: 'Tab Size',
      wordWrap: 'Word Wrap',
      minimap: 'Show Minimap',
      shortcuts: 'Keyboard Shortcuts',
      runCode: 'Run code:',
      newTab: 'New tab:',
      saveFile: 'Save:',
      openSettings: 'Settings:'
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
      // Tooltips
      runTooltip: '运行 (Ctrl+R)',
      clearTooltip: '清空输出 (Ctrl+K)',
      settingsTooltip: '设置',
      confirmSaveOnClose: '是否保存', 
      // Settings panel
      general: '通用',
      appearance: '外观',
      editor: '编辑器',
      font: '字体',
      tabSize: 'Tab 大小',
      wordWrap: '自动换行',
      minimap: '显示小地图',
      shortcuts: '键盘快捷键',
      runCode: '运行代码:',
      newTab: '新建标签页:',
      saveFile: '保存:',
      openSettings: '设置:'
    }
  };
  // 构造函数，应用程序初始化时调用
  constructor() {
    this.loadSettings(); // 加载用户设置
    this.configureMonaco(); // 配置 Monaco Editor
    this.initializeMonacoTheme(); // 初始化 Monaco Editor 主题
    this.initializeFirstTab();  // 初始化第一个标签页
    this.setupEventListeners();  // 设置DOM事件监听器
    this.setupKeyboardShortcuts();  // 设置键盘快捷键
    // this.setupTabSystem();  // 设置标签页系统
    this.setupSettingsPanel();  // 设置设置面板
    this.updateUILanguage();  // 根据当前语言设置更新UI文本
  }
  // 配置 Monaco Editor (目前只有占位，Monaco 自动提供 C++ 语言特性)
  private configureMonaco(): void {
    // Monaco automatically provides basic C++ language features with 'cpp' language mode.
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
  // 初始化第一个标签页
  private initializeFirstTab(): void {
    this.tabData.set('tab-1', {  // 设置第一个标签页的数据
      title: 'Untitled-1',  // 默认标题
      content: this.getWelcomeCode(),  // 欢迎代码作为初始内容
      isDirty: false,  // 初始状态为未修改
      file: null  // 初始未关联文件
    });
    this.createEditor('tab-1');  // 为第一个标签页创建编辑器实例
  }
  // 为指定标签页ID创建 Monaco Editor 实例
  private createEditor(tabId: string): void {
    const editorContainer = document.querySelector(`[data-tab-id="${tabId}"].editor-container`) as HTMLElement; // 获取编辑器容器
    if (!editorContainer) return; // 如果容器不存在则返回

    const editor = monaco.editor.create(editorContainer, {  // 创建 Monaco Editor 实例
      value: this.tabData.get(tabId)?.content || '',  // 编辑器初始内容，从 tabData 获取
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

    // 监听编辑器内容变化，更新标签页的“已修改”状态
    editor.onDidChangeModelContent(() => {
      const tabData = this.tabData.get(tabId);
      if (tabData) {
        tabData.isDirty = true;  // 设置为已修改
        tabData.content = editor.getValue();  // 更新标签页内容
        this.updateTabTitle(tabId);  // 更新标签页标题以显示修改状态
       }
     });

    this.editors.set(tabId, editor);  // 将编辑器实例存储到 Map 中
  }
  // 设置主要的DOM事件监听器
  private setupEventListeners(): void {
    // 运行按钮事件
    document.getElementById('runBtn')?.addEventListener('click', () => {
      this.executeCode(); // 点击运行按钮执行代码
    });

     // 清空输出按钮事件
    document.getElementById('clearBtn')?.addEventListener('click', () => {
      this.clearOutput();  // 点击清空按钮清空输出
    });
  }
  // 设置键盘快捷键
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;  // 判断是否为 Mac 系统
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;  // 根据系统判断使用 Command 键还是 Control 键
      
        // 添加这一行进行调试
      console.log('Keydown event:', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      });
      if (cmdOrCtrl && e.key === 'r') { // Ctrl/Cmd + R 运行代码
        e.preventDefault();  // 阻止默认行为 (如浏览器刷新)
        this.executeCode();
      } 
    });
  }
  // 添加新的标签页
  private addNewTab(): void {
    this.tabCounter++; // 标签页计数器递增
    const newTabId = `tab-${this.tabCounter}`; // 生成新的标签页ID
    const newTabTitle = `Untitled-${this.tabCounter}`; // 生成新的默认标签页标题

    // 添加标签页数据
    this.tabData.set(newTabId, {
      title: newTabTitle,
      content: '', // 新标签页内容为空
      isDirty: false, // 初始为未修改
      file: null // 初始未关联文件
    });

    // 创建标签页的DOM元素
    const tabsContainer = document.querySelector('.tabs-list'); // 获取标签页列表容器
    const newTab = document.createElement('div'); // 创建新的 div 元素作为标签页
    newTab.className = 'tab'; // 添加 'tab' 类
    newTab.setAttribute('data-tab-id', newTabId); // 设置 data-tab-id 属性
    newTab.innerHTML = `
      <span class="tab-title">${newTabTitle}</span>
      <button class="tab-close" data-tooltip="${this.t('closeTabTooltip')}">
        <i class="fas fa-times"></i>
      </button>
    `; // 设置标签页内容，包括标题和关闭按钮
    tabsContainer?.appendChild(newTab); // 将新标签页添加到列表中

    // 创建标签页内容的DOM元素 (编辑器和输出面板)
    const tabsContent = document.querySelector('.tabs-content'); // 获取标签页内容容器
    const newTabPane = document.createElement('div'); // 创建新的 div 元素作为标签页内容面板
    newTabPane.className = 'tab-pane'; // 添加 'tab-pane' 类
    newTabPane.setAttribute('data-tab-id', newTabId); // 设置 data-tab-id 属性
    newTabPane.innerHTML = `
      <div class="split-view">
         <div class="split-panel editor-panel">
            <div class="editor-container" data-tab-id="${newTabId}"></div>
          </div>
          
          <div class="split-divider"></div>
          
          <div class="split-panel output-panel">
            <div class="output-container" data-tab-id="${newTabId}"></div>
          </div>
       </div>
    `; // 设置标签页内容面板的结构，包括编辑器容器和输出容器
    tabsContent?.appendChild(newTabPane); // 将新标签页内容面板添加到容器中

    // 延迟创建编辑器并切换到新标签页，确保DOM已渲染
    setTimeout(() => {
      this.createEditor(newTabId); // 为新标签页创建编辑器
      this.switchToTab(newTabId); // 切换到新标签页
    }, 100);
  }
  // 切换到指定标签页
  private switchToTab(tabId: string): void {
    // 移除所有标签页和内容面板的 'active' 类
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    // 为选定的标签页和内容面板添加 'active' 类
    document.querySelector(`[data-tab-id="${tabId}"].tab`)?.classList.add('active');
    document.querySelector(`[data-tab-id="${tabId}"].tab-pane`)?.classList.add('active');

    this.activeTabId = tabId; // 更新当前激活的标签页ID

    // 触发编辑器重新布局，以适应可能改变的容器大小
    setTimeout(() => {
      const editor = this.editors.get(tabId);
      if (editor) {
        editor.layout(); // 重新布局编辑器
      }
    }, 100);

    this.updateTitle(); // 更新窗口标题
  }
  // 执行当前激活标签页中的代码
  private async executeCode(): Promise<void> {
    const editor = this.editors.get(this.activeTabId);  // 获取当前激活标签页的编辑器实例
    if (!editor) return;  // 如果编辑器不存在则返回

    const code = editor.getValue();  // 获取编辑器中的代码
    this.clearOutput(this.activeTabId);   // 清空当前标签页的输出
    await this.executeCodeSafely(this.activeTabId, code);  // 安全地执行代码
  }
  // 向指定标签页的输出面板追加内容
  private appendOutput(tabId: string, type: string, text: string, timestamp: Date): void {
    const outputContainer = document.querySelector(`[data-tab-id="${tabId}"].output-container`) as HTMLElement;  // 获取输出容器
    if (!outputContainer) return;   // 如果容器不存在则返回

    const outputLine = document.createElement('div');  // 创建新的 div 元素作为输出行
    outputLine.className = `output-${type}`;  // 添加对应类型的类名 (如 output-info, output-log, output-error)
    
    outputLine.innerHTML = text.replace(/\n/g, '<br>'); // 将换行符转换为 <br> 标签以保留格式
    outputContainer.appendChild(outputLine);  // 将输出行添加到容器中
    outputContainer.scrollTop = outputContainer.scrollHeight;  // 滚动到最新输出
  }
  // 清空指定标签页（或当前激活标签页）的输出面板
  private clearOutput(tabId?: string): void {
    const targetTabId = tabId || this.activeTabId;  // 确定目标标签页ID
    const outputContainer = document.querySelector(`[data-tab-id="${targetTabId}"].output-container`) as HTMLElement;  // 获取输出容器
    if (outputContainer) {
      outputContainer.innerHTML = '';  // 清空容器内容
    }
  }


  private updateTabTitle(tabId: string): void {
    const tabData = this.tabData.get(tabId);
    if (!tabData) return;

    const tabElement = document.querySelector(`[data-tab-id="${tabId}"] .tab-title`) as HTMLElement;
    if (tabElement) {
      tabElement.textContent = tabData.title + (tabData.isDirty ? ' •' : '');
    }

    if (tabId === this.activeTabId) {
      this.updateTitle();
    }
  }

  private updateTitle(): void {
    const tabData = this.tabData.get(this.activeTabId);
    if (tabData) {
      const title = `${tabData.title}${tabData.isDirty ? ' •' : ''} - DSALab`;
      document.title = title;
    }
  }

  private setupSettingsPanel(): void {
    this.setupSettingsEventListeners();
    this.applySettingsToUI();
  }

  private setupSettingsEventListeners(): void {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const fontSizeSlider = document.getElementById('font-size-input') as HTMLInputElement;
    const fontSizeValue = document.getElementById('font-size-value');
    const wordWrapToggle = document.getElementById('word-wrap-toggle') as HTMLInputElement;
    const minimapToggle = document.getElementById('minimap-toggle') as HTMLInputElement;
    const lineNumbersToggle = document.getElementById('line-numbers-toggle') as HTMLInputElement;
    const tabSizeSelect = document.getElementById('tab-size-input') as HTMLSelectElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;

    // 打开设置面板
    settingsBtn?.addEventListener('click', () => {
      settingsPanel?.classList.add('open');
    });

    // 关闭设置面板
    closeSettingsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Close button clicked'); // Debug
      settingsPanel?.classList.remove('open');
    });

    // 点击覆盖层关闭模态框
    settingsPanel?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === settingsPanel) {
        settingsPanel.classList.remove('open');
      }
    });

    // 按 Escape 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsPanel?.classList.contains('open')) {
        settingsPanel.classList.remove('open');
      }
    });

    // 主题设置
    themeSelect?.addEventListener('change', () => {
      const theme = themeSelect.value;
      this.settings.theme = theme;
      this.editors.forEach(editor => {
        monaco.editor.setTheme(theme);
      });
      this.saveSettings();
    });

    // 字体大小设置
    fontSizeSlider?.addEventListener('input', () => {
      const fontSize = parseInt(fontSizeSlider.value);
      this.settings.fontSize = fontSize;
      
      // Update the display value
      if (fontSizeValue) {
        fontSizeValue.textContent = `${fontSize}px`;
      }
      
      // Update all editors
      this.editors.forEach(editor => {
        editor.updateOptions({ fontSize });
      });
      this.saveSettings();
    });

    // 自动换行设置
    wordWrapToggle?.addEventListener('change', () => {
      const wordWrap = wordWrapToggle.checked ? 'on' : 'off';
      this.settings.wordWrap = wordWrapToggle.checked;
      this.editors.forEach(editor => {
        editor.updateOptions({ wordWrap });
      });
      this.saveSettings();
    });

    // 小地图设置
    minimapToggle?.addEventListener('change', () => {
      const minimapEnabled = minimapToggle.checked;
      this.settings.minimap = minimapEnabled;
      this.editors.forEach(editor => {
        editor.updateOptions({ minimap: { enabled: minimapEnabled } });
      });
      this.saveSettings();
    });

    // 行号设置
    lineNumbersToggle?.addEventListener('change', () => {
      const lineNumbers = lineNumbersToggle.checked ? 'on' : 'off';
      this.settings.lineNumbers = lineNumbersToggle.checked;
      this.editors.forEach(editor => {
        editor.updateOptions({ lineNumbers });
      });
      this.saveSettings();
    });

    // Tab 大小设置
    tabSizeSelect?.addEventListener('change', () => {
      const tabSize = parseInt(tabSizeSelect.value);
      this.settings.tabSize = tabSize;
      this.editors.forEach(editor => {
        editor.updateOptions({ tabSize });
      });
      this.saveSettings();
    });

    // 语言设置
    languageSelect?.addEventListener('change', () => {
      this.settings.language = languageSelect.value;
      this.saveSettings();
      // Update UI with new language
      this.updateUILanguage();
    });

    // 字体家族设置
    fontFamilySelect?.addEventListener('change', () => {
      const fontFamily = fontFamilySelect.value;
      this.settings.fontFamily = fontFamily;
      this.editors.forEach(editor => {
        editor.updateOptions({ fontFamily });
      });
      this.saveSettings();
    });
  }

  private async executeCodeSafely(tabId: string, code: string): Promise<void> {
    const outputContainer = document.querySelector(`[data-tab-id="${tabId}"].output-container`) as HTMLElement;
    if (!outputContainer) return;

    // Clear previous output
    this.clearOutput(tabId);
    this.appendOutput(tabId, 'info', '正在编译并运行C++代码...', new Date());

    try {
      // Call main process to compile and run C++
      const result = await window.electron.compileAndRunCpp(code, this.EXECUTION_TIMEOUT);

      if (result.error) {
        this.appendFriendlyError(tabId, new Error(result.error));
      }
      if (result.output) {
        this.clearOutput(tabId);
        this.appendOutput(tabId, 'info', '运行结果：', new Date());
        this.appendOutput(tabId, 'log', result.output, new Date());
      }
      if (result.success && !result.error && !result.output) {
        this.appendOutput(tabId, 'result', '代码执行完成，无输出。', new Date());
      }
      
    } catch (error: any) {
      this.appendFriendlyError(tabId, error);
    }
  }

  private appendSecurityError(tabId: string, message: string): void {
    const outputContainer = document.querySelector(`[data-tab-id="${tabId}"].output-container`) as HTMLElement;
    if (!outputContainer) return;

    const errorLine = document.createElement('div');
    errorLine.className = 'output-security-error';
    
    errorLine.innerHTML = `🛡️ ${message}`;
    outputContainer.appendChild(errorLine);
    outputContainer.scrollTop = outputContainer.scrollHeight;
  }

  private appendFriendlyError(tabId: string, error: Error): void {
    const outputContainer = document.querySelector(`[data-tab-id="${tabId}"].output-container`) as HTMLElement;
    if (!outputContainer) return;

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
  }

  private loadSettings(): void {
    try {
      const savedSettings = localStorage.getItem(this.SETTINGS_KEY);
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }
    } catch (error) {
      console.warn('Error loading settings:', error);
    }
  }

  private t(key: string): string {
    const lang = this.settings.language as 'en' | 'zh';
    return this.translations[lang][key as keyof typeof this.translations.en] || key;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Error saving settings:', error);
    }
  }

  private applySettingsToUI(): void {
    // Update UI elements with current settings
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const fontSizeInput = document.getElementById('font-size-input') as HTMLInputElement;
    const fontSizeValue = document.getElementById('font-size-value');
    const wordWrapToggle = document.getElementById('word-wrap-toggle') as HTMLInputElement;
    const minimapToggle = document.getElementById('minimap-toggle') as HTMLInputElement;
    const lineNumbersToggle = document.getElementById('line-numbers-toggle') as HTMLInputElement;
    const tabSizeInput = document.getElementById('tab-size-input') as HTMLSelectElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;

    if (themeSelect) themeSelect.value = this.settings.theme;
    if (fontSizeInput) {
      fontSizeInput.value = this.settings.fontSize.toString();
      if (fontSizeValue) {
        fontSizeValue.textContent = `${this.settings.fontSize}px`;
      }
    }
    if (wordWrapToggle) wordWrapToggle.checked = this.settings.wordWrap;
    if (minimapToggle) minimapToggle.checked = this.settings.minimap;
    if (lineNumbersToggle) lineNumbersToggle.checked = this.settings.lineNumbers;
    if (tabSizeInput) tabSizeInput.value = this.settings.tabSize.toString();
    if (languageSelect) languageSelect.value = this.settings.language;
    if (fontFamilySelect) fontFamilySelect.value = this.settings.fontFamily;
  }

  private updateUILanguage(): void {
    // Update tooltips for sidebar buttons
    const runBtn = document.getElementById('runBtn');
    const clearBtn = document.getElementById('clearBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    if (runBtn) runBtn.setAttribute('data-tooltip', this.t('runTooltip'));
    if (clearBtn) clearBtn.setAttribute('data-tooltip', this.t('clearTooltip'));
    if (settingsBtn) settingsBtn.setAttribute('data-tooltip', this.t('settingsTooltip'));

    // Update settings panel content
    this.updateSettingsPanelLanguage();
  }

  private updateSettingsPanelLanguage(): void {
    // Update settings panel headers and labels
    const settingsTitle = document.querySelector('.settings-header h3');
    if (settingsTitle) settingsTitle.textContent = this.t('settings');

    // Update section headers
    const sections = document.querySelectorAll('.settings-section h4');
    if (sections[0]) sections[0].textContent = this.t('general');
    if (sections[1]) sections[1].textContent = this.t('appearance');
    if (sections[2]) sections[2].textContent = this.t('editor');
    if (sections[3]) sections[3].textContent = this.t('shortcuts');

    // Update labels
    const labels = document.querySelectorAll('.setting-item label');
    labels.forEach(label => {
      const text = label.textContent?.trim();
      if (text?.includes('Language')) {
        label.childNodes[0].textContent = this.t('language') + ': ';
      } else if (text?.includes('Theme')) {
        label.childNodes[0].textContent = this.t('theme') + ': ';
      } else if (text?.includes('Font')) {
        label.childNodes[0].textContent = this.t('font') + ': ';
      } else if (text?.includes('Font Size')) {
        label.childNodes[0].textContent = this.t('fontSize') + ': ';
      } else if (text?.includes('Tab Size')) {
        label.childNodes[0].textContent = this.t('tabSize') + ': ';
      }
    });

    // Update checkbox labels
    const checkboxLabels = document.querySelectorAll('.setting-item label');
    checkboxLabels.forEach(label => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox) {
        const text = label.textContent?.trim();
        if (text?.includes('Word Wrap')) {
          label.childNodes[2].textContent = this.t('wordWrap');
        } else if (text?.includes('Minimap')) {
          label.childNodes[2].textContent = this.t('minimap');
        } else if (text?.includes('Line Numbers')) {
          label.childNodes[2].textContent = this.t('lineNumbers');
        }
      }
    });

    // Update keyboard shortcuts section
    const shortcutItems = document.querySelectorAll('.shortcut-item span');
    if (shortcutItems[0]) shortcutItems[0].textContent = this.t('runCode');
    if (shortcutItems[1]) shortcutItems[1].textContent = this.t('newTab');
    if (shortcutItems[2]) shortcutItems[2].textContent = this.t('saveFile');
    if (shortcutItems[3]) shortcutItems[3].textContent = this.t('openSettings');
  }

  private getWelcomeCode(): string {
    return `// 欢迎来到 DSALab! 🚀

#include <iostream>
#include <vector>
#include <string>

int main() {
    // 基本 C++ 示例
    std::cout << "Hello DSALab!" << std::endl;

    // 变量和数据类型
    int age = 20;
    std::string name = "张三";
    bool isStudent = true;

    std::cout << "姓名: " << name << std::endl;
    std::cout << "年龄: " << age << std::endl;
    std::cout << "是否学生: " << (isStudent ? "是" : "否") << std::endl;

    // 循环
    std::cout << "从 1 到 5 的数字:" << std::endl;
    for (int i = 1; i <= 5; ++i) {
        std::cout << i << " ";
    }
    std::cout << std::endl;

    // 向量 (动态数组)
    std::vector<int> numbers = {10, 20, 30, 40, 50};
    std::cout << "向量元素:" << std::endl;
    for (int num : numbers) {
        std::cout << num << " ";
    }
    std::cout << std::endl;

    // 函数示例
    auto add = [](int a, int b) {
        return a + b;
    };
    std::cout << "10 + 20 = " << add(10, 20) << std::endl;

    // 按 Ctrl/Cmd + R 手动执行！
    // 按 Ctrl/Cmd + T 新建标签页！
    // 按 Ctrl/Cmd + S 保存！
    // 按 Ctrl/Cmd + , 打开设置！

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