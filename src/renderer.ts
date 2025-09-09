// renderer.ts
/**
 * WizardJS - C++ Playground
 * Open Source alternative to RunJs
 */

import './index.css';

// Monaco Editor imports
import * as monaco from 'monaco-editor';

// Declare the 'electron' API exposed by preload.ts
declare global {
  interface Window {
    electron: {
      compileAndRunCpp: (code: string, timeout: number) => Promise<{ success: boolean; output: string; error: string }>;
      showOpenDialog: () => Promise<{ filePath: string; content: string } | null>;
      showSaveDialog: (currentFilePath: string | null, defaultFileName: string, content: string) => Promise<string | null>;
    };
  }
}

// WizardJS Application Class
interface AppSettings {
  theme: string;
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  tabSize: number;
  fontFamily: string;
  language: string;
}

interface ThemeDefinition {
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

class WizardJSApp {
  private editors: Map<string, monaco.editor.IStandaloneCodeEditor> = new Map();
  private tabCounter = 1;
  private activeTabId = 'tab-1';
  private tabData: Map<string, { title: string; content: string; isDirty: boolean; file: string | null }> = new Map();
  private readonly EXECUTION_TIMEOUT = 5000; // 5 seconds maximum execution
  private readonly MAX_OUTPUT_LINES = 1000; // Maximum 1000 lines of output
  private executionAbortController: Map<string, AbortController> = new Map();
  private settings: AppSettings = {
    theme: 'github-dark',
    fontSize: 14,
    wordWrap: true,
    minimap: false,
    lineNumbers: false,
    tabSize: 2,
    fontFamily: 'JetBrains Mono',
    language: 'zh' // Default to Chinese
  };
  private readonly SETTINGS_KEY = 'wizardjs-settings';

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

  private fontFamilies = [
    'JetBrains Mono',
    'Fira Code',
    'Consolas',
    'Monaco',
    'Menlo'
  ];

  private translations = {
    en: {
      file: 'File',
      new: 'New',
      open: 'Open',
      save: 'Save',
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
      newTooltip: 'New file (Ctrl+N)',
      openTooltip: 'Open file (Ctrl+O)',
      saveTooltip: 'Save (Ctrl+S)',
      clearTooltip: 'Clear output (Ctrl+K)',
      settingsTooltip: 'Settings (Ctrl+,)',
      closeTabTooltip: 'Close Tab', // Added
      newTabTooltip: 'New Tab (Ctrl+T)', // Added
      confirmSaveOnClose: 'Do you want to save changes to', // Added
      // Settings panel
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
    zh: { // Chinese translations
      file: '文件',
      new: '新建',
      open: '打开',
      save: '保存',
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
      newTooltip: '新建文件 (Ctrl+N)',
      openTooltip: '打开文件 (Ctrl+O)',
      saveTooltip: '保存 (Ctrl+S)',
      clearTooltip: '清空输出 (Ctrl+K)',
      settingsTooltip: '设置 (Ctrl+,)',
      closeTabTooltip: '关闭标签页', // Added
      newTabTooltip: '新建标签页 (Ctrl+T)', // Added
      confirmSaveOnClose: '是否保存对', // Added
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

  constructor() {
    this.loadSettings();
    this.configureMonaco();
    this.initializeMonacoTheme();
    this.initializeFirstTab();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupTabSystem();
    this.setupSettingsPanel();
    this.updateUILanguage();
  }

  private configureMonaco(): void {
    // Monaco automatically provides basic C++ language features with 'cpp' language mode.
  }

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

  private initializeFirstTab(): void {
    this.tabData.set('tab-1', {
      title: 'Untitled-1',
      content: this.getWelcomeCode(),
      isDirty: false,
      file: null
    });
    this.createEditor('tab-1');
  }

  private createEditor(tabId: string): void {
    const editorContainer = document.querySelector(`[data-tab-id="${tabId}"].editor-container`) as HTMLElement;
    if (!editorContainer) return;

    const editor = monaco.editor.create(editorContainer, {
      value: this.tabData.get(tabId)?.content || '',
      language: 'cpp', // Changed to C++
      theme: this.settings.theme,
      fontSize: this.settings.fontSize,
      fontFamily: this.settings.fontFamily,
      minimap: { enabled: this.settings.minimap },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: this.settings.tabSize,
      insertSpaces: true,
      wordWrap: this.settings.wordWrap ? 'on' : 'off',
      lineNumbers: this.settings.lineNumbers ? 'on' : 'off',
      renderWhitespace: 'selection',
      contextmenu: true,
      mouseWheelZoom: true,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true
      },
      hover: { enabled: true },
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      autoClosingBrackets: 'languageDefined',
      autoClosingQuotes: 'languageDefined',
      autoSurround: 'languageDefined'
    });

    // Track changes for dirty state
    editor.onDidChangeModelContent(() => {
      const tabData = this.tabData.get(tabId);
      if (tabData) {
        tabData.isDirty = true;
        tabData.content = editor.getValue();
        this.updateTabTitle(tabId);
       }
     });

    this.editors.set(tabId, editor);
  }

  private setupEventListeners(): void {
    // Run button
    document.getElementById('runBtn')?.addEventListener('click', () => {
      this.executeCode();
    });

    // Clear button
    document.getElementById('clearBtn')?.addEventListener('click', () => {
      this.clearOutput();
    });

    // File operations
    document.getElementById('newBtn')?.addEventListener('click', () => {
      this.newFile();
    });

    document.getElementById('openBtn')?.addEventListener('click', () => {
      this.openFile();
    });

    document.getElementById('saveBtn')?.addEventListener('click', () => {
      this.saveFile();
    });
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 'r') {
        e.preventDefault();
        this.executeCode();
      } else if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        this.saveFile();
      } else if (cmdOrCtrl && e.key === 'n') {
        e.preventDefault();
        this.newFile();
      } else if (cmdOrCtrl && e.key === 'o') {
        e.preventDefault();
        this.openFile();
      } else if (cmdOrCtrl && e.key === 't') {
        e.preventDefault();
        this.addNewTab();
      } else if (cmdOrCtrl && e.key === ',') {
        e.preventDefault();
        document.getElementById('settingsPanel')?.classList.add('open');
      }
    });
  }

  private setupTabSystem(): void {
    // Add tab button
    const addTabBtn = document.querySelector('.add-tab-btn');
    addTabBtn?.addEventListener('click', () => {
      this.addNewTab();
    });
    // Set tooltip for add tab button
    if (addTabBtn) {
      addTabBtn.setAttribute('data-tooltip', this.t('newTabTooltip'));
    }

    // Setup event delegation for tab clicks and close buttons
    document.querySelector('.tabs-list')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tab = target.closest('.tab') as HTMLElement;
      
      if (!tab) return;
      
      const tabId = tab.getAttribute('data-tab-id');
      if (!tabId) return;

      if (target.closest('.tab-close')) {
        this.closeTab(tabId);
      } else {
        this.switchToTab(tabId);
      }
    });
  }

  private addNewTab(): void {
    this.tabCounter++;
    const newTabId = `tab-${this.tabCounter}`;
    const newTabTitle = `Untitled-${this.tabCounter}`;

    // Add tab data
    this.tabData.set(newTabId, {
      title: newTabTitle,
      content: '',
      isDirty: false,
      file: null
    });

    // Create tab element
    const tabsContainer = document.querySelector('.tabs-list');
    const newTab = document.createElement('div');
    newTab.className = 'tab';
    newTab.setAttribute('data-tab-id', newTabId);
    newTab.innerHTML = `
      <span class="tab-title">${newTabTitle}</span>
      <button class="tab-close" data-tooltip="${this.t('closeTabTooltip')}">
        <i class="fas fa-times"></i>
      </button>
    `;
    tabsContainer?.appendChild(newTab);

    // Create tab content
    const tabsContent = document.querySelector('.tabs-content');
    const newTabPane = document.createElement('div');
    newTabPane.className = 'tab-pane';
    newTabPane.setAttribute('data-tab-id', newTabId);
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
    `;
    tabsContent?.appendChild(newTabPane);

    // Create editor for new tab
    setTimeout(() => {
      this.createEditor(newTabId);
      this.switchToTab(newTabId);
    }, 100);
  }

  private closeTab(tabId: string): void {
    const tabData = this.tabData.get(tabId);
    
    // Check if there's only one tab left
    if (this.tabData.size <= 1) {
      return; // Don't close the last tab
    }

    // Check if tab has unsaved changes
    if (tabData?.isDirty) {
      const save = confirm(`${this.t('confirmSaveOnClose')} ${tabData.title}?`);
      if (save) {
        this.saveFile(tabId);
      }
    }

    // Remove editor
    const editor = this.editors.get(tabId);
    if (editor) {
      editor.dispose();
      this.editors.delete(tabId);
    }

    // Remove tab data
    this.tabData.delete(tabId);

    // Remove DOM elements
    document.querySelector(`[data-tab-id="${tabId}"].tab`)?.remove();
    document.querySelector(`[data-tab-id="${tabId}"].tab-pane`)?.remove();

    // Switch to another tab if this was the active tab
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabData.keys());
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[0]);
      }
    }
  }

  private switchToTab(tabId: string): void {
    // Remove active class from all tabs and panes
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    // Add active class to selected tab and pane
    document.querySelector(`[data-tab-id="${tabId}"].tab`)?.classList.add('active');
    document.querySelector(`[data-tab-id="${tabId}"].tab-pane`)?.classList.add('active');

    this.activeTabId = tabId;

    // Trigger editor resize
    setTimeout(() => {
      const editor = this.editors.get(tabId);
      if (editor) {
        editor.layout();
      }
    }, 100);

    this.updateTitle();
  }

  private async executeCode(): Promise<void> {
    const editor = this.editors.get(this.activeTabId);
    if (!editor) return;

    const code = editor.getValue();
    this.clearOutput(this.activeTabId);
    await this.executeCodeSafely(this.activeTabId, code);
  }

  private appendOutput(tabId: string, type: string, text: string, timestamp: Date): void {
    const outputContainer = document.querySelector(`[data-tab-id="${tabId}"].output-container`) as HTMLElement;
    if (!outputContainer) return;

    const outputLine = document.createElement('div');
    outputLine.className = `output-${type}`;
    
    outputLine.innerHTML = text.replace(/\n/g, '<br>'); // Preserve newlines
    outputContainer.appendChild(outputLine);
    outputContainer.scrollTop = outputContainer.scrollHeight;
  }

  private clearOutput(tabId?: string): void {
    const targetTabId = tabId || this.activeTabId;
    const outputContainer = document.querySelector(`[data-tab-id="${targetTabId}"].output-container`) as HTMLElement;
    if (outputContainer) {
      outputContainer.innerHTML = '';
    }
  }

  private newFile(): void {
    this.addNewTab();
  }

  private async openFile(): Promise<void> {
    try {
      const result = await window.electron.showOpenDialog();
      
      if (result && result.filePath && result.content !== undefined) {
        const editor = this.editors.get(this.activeTabId);
        if (editor) {
          editor.setValue(result.content);
          const tabData = this.tabData.get(this.activeTabId);
          if (tabData) {
            tabData.file = result.filePath;
            tabData.title = result.filePath.split(/[\\/]/).pop() || 'Untitled';
            tabData.isDirty = false;
            this.updateTabTitle(this.activeTabId);
          }
        }
      }
    } catch (error) {
      console.error('Error opening file:', error);
      this.appendFriendlyError(this.activeTabId, new Error(`打开文件失败: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async saveFile(tabId?: string): Promise<void> {
    const targetTabId = tabId || this.activeTabId;
    const editor = this.editors.get(targetTabId);
    const tabData = this.tabData.get(targetTabId);
    
    if (!editor || !tabData) return;
    
    const content = editor.getValue();
    const defaultFileName = tabData.title.endsWith('.cpp') ? tabData.title : tabData.title + '.cpp';
    
    try {
      const savedFilePath = await window.electron.showSaveDialog(tabData.file, defaultFileName, content);
      
      if (savedFilePath) {
        tabData.file = savedFilePath;
        tabData.title = savedFilePath.split(/[\\/]/).pop() || 'Untitled';
        tabData.isDirty = false;
        this.updateTabTitle(targetTabId);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      this.appendFriendlyError(this.activeTabId, new Error(`保存文件失败: ${error instanceof Error ? error.message : String(error)}`));
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
      const title = `${tabData.title}${tabData.isDirty ? ' •' : ''} - WizardJS`;
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
    const newBtn = document.getElementById('newBtn');
    const openBtn = document.getElementById('openBtn');
    const saveBtn = document.getElementById('saveBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    if (runBtn) runBtn.setAttribute('data-tooltip', this.t('runTooltip'));
    if (clearBtn) clearBtn.setAttribute('data-tooltip', this.t('clearTooltip'));
    if (newBtn) newBtn.setAttribute('data-tooltip', this.t('newTooltip'));
    if (openBtn) openBtn.setAttribute('data-tooltip', this.t('openTooltip'));
    if (saveBtn) saveBtn.setAttribute('data-tooltip', this.t('saveTooltip'));
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
    return `// 欢迎来到 WizardJS! 🚀
// 你的开源 C++ 演练场

#include <iostream>
#include <vector>
#include <string>

int main() {
    // 基本 C++ 示例
    std::cout << "你好 WizardJS!" << std::endl;

    // 变量和数据类型
    int age = 30;
    std::string name = "张三";
    bool isStudent = false;

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
  document.addEventListener('DOMContentLoaded', () => new WizardJSApp());
} else {
  new WizardJSApp();
}