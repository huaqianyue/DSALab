// src/components/App.ts

import * as monaco from 'monaco-editor';
import {
  AppSettings, Problem, ProblemWorkspaceData, HistoryEvent, CodeEditEvent,
  Translations, AppTranslations, Language, SimplifiedContentChange
} from '../types';

import { MonacoEditorComponent } from './MonacoEditorComponent';
import { ProblemListComponent } from './ProblemListComponent';
import { ProblemDescriptionComponent } from './ProblemDescriptionComponent';
import { OutputPanelComponent } from './OutputPanelComponent';
import { AudioPanelComponent } from './AudioPanelComponent';
import { ToolbarComponent } from './ToolbarComponent';
import { SettingsComponent } from './SettingsComponent';
import { SplitterManager } from './SplitterManager';
import { ExportModalComponent } from './ExportModalComponent';

export class App {
  // Core State
  private problems: Problem[] = [];
  private currentProblemId: string | null = null;
  private problemWorkspaceData: Map<string, ProblemWorkspaceData> = new Map();
  private appSettings: AppSettings = { userName: '', studentId: '', lastOpenedProblemId: null };

  // Component Instances
  private monacoEditorComponent: MonacoEditorComponent | null = null;
  private problemListComponent: ProblemListComponent;
  private problemDescriptionComponent: ProblemDescriptionComponent;
  private outputPanelComponent: OutputPanelComponent;
  private audioPanelComponent: AudioPanelComponent;
  private toolbarComponent: ToolbarComponent;
  private settingsComponent: SettingsComponent;
  private splitterManager: SplitterManager;
  private exportModalComponent: ExportModalComponent;

  // Internal Flags
  private suppressDirtyFlag: boolean = false; // 用于抑制编辑器内容变化时设置isDirty

  // Constants
  private readonly EXECUTION_TIMEOUT = 360000; // 6 minutes (360 seconds)
  private currentLanguage: Language = 'zh'; // Default language

  private readonly translations: AppTranslations = {
    en: {
      run: 'Run', clear: 'Clear', export: 'Export', refresh: 'Refresh', import: 'Import', save: 'Save', recordAudio: 'Record Audio', playAudio: 'Play Audio', prevProblem: 'Previous Problem', nextProblem: 'Next Problem',
      runTooltip: 'Run (Ctrl+R)', clearTooltip: 'Clear output', exportTooltip: 'Export current problem code and audio', refreshTooltip: 'Refresh problem list from online', importTooltip: 'Import problem list from JSON file', saveTooltip: 'Save current problem (Ctrl+S)', recordAudioTooltip: 'Record audio explanation', playAudioTooltip: 'Play recorded audio', prevProblemTooltip: 'Go to previous problem', nextProblemTooltip: 'Go to next problem',
      confirmSaveOnClose: 'Do you want to save changes to', compiling: 'Compiling C++ code...', running: 'Compilation successful, running...', compilationFailed: 'Compilation failed', executionTimedOut: 'Execution timed out', runtimeError: 'Runtime error', compilerNotFound: 'Compiler Error: g++ not found', programExitedNonZero: 'Program exited with non-zero status code', noOutput: 'Code executed, no output.', error: 'Error', previousProgramTerminated: 'Previous program was forcefully terminated.', noProgramToReceiveInput: 'Error: No program is currently running to receive input.', microphoneAccessFailed: 'Failed to access microphone', recordingStarted: 'Started audio recording...', recordingStopped: 'Recording stopped.', playbackFailed: 'Failed to play audio.', loadingProblemsFailed: 'Failed to load problems:', selectProblem: 'Please select a problem from the "Problem List" on the left to view its description.', selectProblemEditor: 'Please select a problem from the "Problem List" on the left to start coding.', savingData: 'Saving current problem data...', dataSaved: 'Current problem data saved.', saveFailed: 'Failed to save current problem data:', exportProblems: 'Export Problems', selectProblemsToExport: 'Please select problems to export:', exportCancelled: 'Export cancelled.', exportSuccess: 'Problems exported successfully to:', exportFailed: 'Failed to export problems:', missingCodeAudio: 'Missing Code or Audio', deletedProblem: 'Deleted Problem', importSuccess: 'Problems imported successfully. {count} valid problems added/updated. {invalidCount} invalid problems skipped.', importFailed: 'Failed to import problems:', importInvalidFormat: 'Invalid JSON format or structure.', refreshSuccess: 'Problem list refreshed successfully.', refreshFailed: 'Failed to refresh problem list:', missing: 'Missing ', Code: 'Code', Audio: 'Audio', or: ' or ',
    },
    zh: {
      run: '运行', clear: '清空', export: '导出', refresh: '刷新', import: '导入', save: '保存', recordAudio: '录制', playAudio: '播放', prevProblem: '前一题', nextProblem: '后一题',
      runTooltip: '运行 (Ctrl+R)', clearTooltip: '清空输出', exportTooltip: '导出当前题目代码和讲解音频', refreshTooltip: '从在线刷新题目列表', importTooltip: '从JSON文件导入题目列表', saveTooltip: '保存当前题目 (Ctrl+S)', recordAudioTooltip: '录制音频讲解', playAudioTooltip: '播放录制音频', prevProblemTooltip: '切换到上一题', nextProblemTooltip: '切换到下一题',
      confirmSaveOnClose: '是否保存', compiling: '正在编译C++代码...', running: '编译成功，正在运行...', compilationFailed: '编译失败', executionTimedOut: '执行超时', runtimeError: '运行时错误', compilerNotFound: '编译器错误：g++ 未找到', programExitedNonZero: '程序以非零状态码退出', noOutput: '代码执行完成，无输出。', error: '错误', previousProgramTerminated: '上一个程序被强制终止。', noProgramToReceiveInput: '错误：没有正在运行的程序可以接收输入。', microphoneAccessFailed: '无法访问麦克风', recordingStarted: '开始录制音频...', recordingStopped: '录制结束。', playbackFailed: '播放音频失败。', loadingProblemsFailed: '加载题目失败:', selectProblem: '请从左侧的“题目列表”中选择一个题目查看其描述。', selectProblemEditor: '请从左侧的“题目列表”中选择一个题目开始编码。', savingData: '正在保存当前题目数据...', dataSaved: '当前题目数据已保存。', saveFailed: '保存当前题目数据失败:', exportProblems: '导出题目', selectProblemsToExport: '请选择要导出的题目：', exportCancelled: '导出已取消。', exportSuccess: '题目已成功导出到：', exportFailed: '导出题目失败：', missingCodeAudio: '缺少代码或音频', deletedProblem: '已删除', importSuccess: '题目导入成功。新增/更新 {count} 个有效题目，跳过 {invalidCount} 个无效题目。', importFailed: '导入题目失败：', importInvalidFormat: 'JSON格式或结构无效。', refreshSuccess: '题目列表刷新成功。', refreshFailed: '刷新题目列表失败：', missing: '缺少', Code: '代码', Audio: '音频', or: '或',
    }
  };


  constructor() {
    this.initializeComponents();
    this.loadAppSettings().then(() => {
      this.fetchProblemsAndInitializeUI();
      this.setupIpcListeners();
      this.setupKeyboardShortcuts();
    });
  }

  private initializeComponents(): void {
    const editorContainer = document.querySelector('.editor-container') as HTMLElement;
    if (!editorContainer) throw new Error('Editor container not found!');

    this.monacoEditorComponent = new MonacoEditorComponent(editorContainer, {
      initialValue: this.t('selectProblemEditor'),
      language: 'cpp',
      theme: 'github-dark',
      fontSize: 14,
      fontFamily: 'JetBrains Mono',
      minimap: false,
      wordWrap: true,
      lineNumbers: true,
      tabSize: 2,
    }, {
      onContentChange: (changes, cursorPosition, operationType) => this.handleEditorContentChange(changes, cursorPosition, operationType)
    });

    this.problemListComponent = new ProblemListComponent(
      document.querySelector('.problem-list') as HTMLUListElement, // 明确断言为 HTMLUListElement
      { onProblemSelect: (id) => this.switchToProblem(id) },
      this.t.bind(this)
    );

    this.problemDescriptionComponent = new ProblemDescriptionComponent(
      document.getElementById('problemDescriptionContent') as HTMLElement,
      { onNavigate: (direction) => this.navigateProblem(direction) },
      this.t.bind(this)
    );

    this.outputPanelComponent = new OutputPanelComponent(
      document.querySelector('.output-container') as HTMLElement,
      document.getElementById('terminalInput') as HTMLInputElement,
      { onUserInput: (input) => this.sendUserInput(input) },
      this.t.bind(this)
    );

    this.audioPanelComponent = new AudioPanelComponent(
      document.querySelector('.audio-panel') as HTMLElement,
      {
        onAudioModified: (blob, url) => this.handleAudioModified(blob, url),
        onRecordStart: () => this.recordHistoryEvent({ timestamp: Date.now(), problemId: this.currentProblemId!, eventType: 'audio_record_start' }),
        onRecordPause: () => this.recordHistoryEvent({ timestamp: Date.now(), problemId: this.currentProblemId!, eventType: 'audio_record_pause' }),
        onRecordResume: () => this.recordHistoryEvent({ timestamp: Date.now(), problemId: this.currentProblemId!, eventType: 'audio_record_resume' }),
        onRecordStop: (durationMs, audioSizeKB) => this.recordHistoryEvent({ timestamp: Date.now(), problemId: this.currentProblemId!, eventType: 'audio_record_stop', durationMs, audioSizeKB }),
        onAppendOutput: (type, text) => this.outputPanelComponent.appendOutput(type, text),
      },
      this.t.bind(this)
    );

    this.toolbarComponent = new ToolbarComponent(
      {
        onRun: () => this.executeCode(),
        onClearOutput: () => this.clearOutput(),
        onSave: () => this.saveCurrentProblemToDisk(),
        onExport: () => this.openExportModal(),
        onRefresh: () => this.handleRefreshProblems(),
        onImport: () => this.handleImportProblems(),
      },
      this.t.bind(this)
    );

    this.settingsComponent = new SettingsComponent({
      onSettingsChange: (settings) => this.saveAppSettings(settings)
    });

    this.splitterManager = new SplitterManager(
      document.querySelector('.main-split-divider') as HTMLElement,
      document.querySelector('.code-test-panel > .horizontal-split-divider') as HTMLElement,
      document.querySelector('.problem-description-panel') as HTMLElement,
      document.querySelector('.code-test-panel') as HTMLElement,
      document.querySelector('.editor-container') as HTMLElement,
      document.querySelector('.test-output-area') as HTMLElement,
      () => this.monacoEditorComponent?.layout()
    );

    this.exportModalComponent = new ExportModalComponent(
      {
        onConfirmExport: (problemIds) => this.handleConfirmExport(problemIds),
        onAppendOutput: (type, text) => this.outputPanelComponent.appendOutput(type, text),
      },
      this.t.bind(this)
    );

    // Initial setup for problem list tab activation
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tabHeader => {
      tabHeader.addEventListener('click', (event) => {
        const targetTab = (event.currentTarget as HTMLElement).getAttribute('data-tab-target');
        if (targetTab === 'problem-list') {
          this.problemListComponent.activateProblemListTab();
          this.audioPanelComponent.toggleVisibility(false);
        }
      });
    });
  }

  // --- App Settings ---
  private async loadAppSettings(): Promise<void> {
    try {
      this.appSettings = await window.electron.loadAppSettings();
      this.settingsComponent.updateSettings(this.appSettings);
    } catch (error) {
      console.error('Failed to load app settings:', error);
      this.appSettings = { userName: '', studentId: '', lastOpenedProblemId: null };
    }
  }

  private async saveAppSettings(settings?: AppSettings): Promise<void> {
    if (settings) {
      this.appSettings = settings;
    }
    try {
      await window.electron.saveAppSettings(this.appSettings);
    } catch (error) {
      console.error('Failed to save app settings:', error);
    }
  }

  // --- Problem Management ---
  private async fetchProblemsAndInitializeUI(): Promise<void> {
    try {
      this.problems = await window.electron.getProblemsFromLocal();
      this.problemListComponent.updateProblems(this.problems, this.currentProblemId, this.appSettings.lastOpenedProblemId);

      this.problemDescriptionComponent.update(null, this.problems, this.currentProblemId);
      this.monacoEditorComponent?.setValue(this.t('selectProblemEditor'));
      this.audioPanelComponent.toggleVisibility(false);
      this.problemListComponent.activateProblemListTab(); // Always start on problem list tab

      this.updateSaveButtonState();
    } catch (error) {
      console.error(this.t('loadingProblemsFailed'), error);
      this.outputPanelComponent.appendOutput('error', `${this.t('loadingProblemsFailed')} ${error instanceof Error ? error.message : String(error)}`);
      this.monacoEditorComponent?.setValue(`${this.t('loadingProblemsFailed')} ${error instanceof Error ? error.message : String(error)}`);
      this.audioPanelComponent.toggleVisibility(false);
      this.updateSaveButtonState();
    }
  }

  private async switchToProblem(problemId: string): Promise<void> {
    if (!this.monacoEditorComponent) return;

    if (this.currentProblemId && this.currentProblemId !== problemId) {
      await this.saveCurrentProblemToDisk();
      this.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblemId,
        eventType: 'problem_switched',
        codeSnapshot: this.monacoEditorComponent.getValue(),
        audioState: this.problemWorkspaceData.get(this.currentProblemId)?.audioModified ? 'modified' : (this.problemWorkspaceData.get(this.currentProblemId)?.audioBlob ? 'present' : 'absent'),
      });
    }

    this.currentProblemId = problemId;
    this.appSettings.lastOpenedProblemId = problemId;
    await this.saveAppSettings();

    let newProblemData = this.problemWorkspaceData.get(problemId);
    let isProblemLoadedFirstTime = false;
    if (!newProblemData) {
      isProblemLoadedFirstTime = true;
      newProblemData = {
        content: this.getWelcomeCode(),
        isDirty: false,
        output: '',
        audioBlob: null,
        audioUrl: null,
        filePath: null,
        audioModified: false,
      };
      this.problemWorkspaceData.set(problemId, newProblemData);

      const localCode = await window.electron.readProblemCode(problemId);
      if (localCode !== null) {
        newProblemData.content = localCode;
      }

      const audioArrayBuffer = await window.electron.readProblemAudio(problemId);
      if (audioArrayBuffer) {
        const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/webm' });
        newProblemData.audioBlob = audioBlob;
        newProblemData.audioUrl = URL.createObjectURL(audioBlob);
      }
    }

    this.suppressDirtyFlag = true;
    this.monacoEditorComponent.setValue(newProblemData.content);
    this.suppressDirtyFlag = false;

    this.outputPanelComponent.restoreOutputContent(newProblemData.output);
    this.audioPanelComponent.updateAudioState(newProblemData.audioBlob, newProblemData.audioUrl);
    this.audioPanelComponent.toggleVisibility(true);

    this.problemListComponent.updateProblems(this.problems, this.currentProblemId, this.appSettings.lastOpenedProblemId);
    const problem = this.problems.find(p => p.id === problemId);
    this.problemDescriptionComponent.update(problem || null, this.problems, this.currentProblemId);
    this.updateTitle();
    this.problemDescriptionComponent.activateProblemDescriptionTab();
    this.updateSaveButtonState();

    if (isProblemLoadedFirstTime) {
      this.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'problem_loaded',
        codeSnapshot: newProblemData.content,
      });
    }
  }

  private async saveCurrentProblemToDisk(): Promise<void> {
    if (!this.currentProblemId) return;

    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (!problemData) return;

    if (problemData.isDirty || problemData.audioModified) {
      this.outputPanelComponent.appendOutput('info', this.t('savingData'));

      let audioDataForMain: ArrayBuffer | null = null;
      if (problemData.audioBlob) {
        try {
          audioDataForMain = await problemData.audioBlob.arrayBuffer();
        } catch (e) {
          console.error("Failed to convert audio Blob to ArrayBuffer:", e);
          this.outputPanelComponent.appendOutput('error', `音频数据转换失败: ${e instanceof Error ? e.message : String(e)}`);
          audioDataForMain = null;
        }
      }

      const success = await window.electron.saveProblemWorkspace(
        this.currentProblemId,
        problemData.content,
        audioDataForMain
      );

      if (success) {
        problemData.isDirty = false;
        problemData.audioModified = false;
        this.updateTitle();

        const problemIndex = this.problems.findIndex(p => p.id === this.currentProblemId);
        if (problemIndex !== -1) {
          const updatedProblem = { ...this.problems[problemIndex] };
          updatedProblem.Code = 'code.cpp';
          updatedProblem.Audio = problemData.audioBlob ? 'audio.webm' : '';

          this.problems[problemIndex] = updatedProblem;
          await window.electron.saveProblemsToLocal(this.problems);
          this.problemListComponent.updateProblems(this.problems, this.currentProblemId, this.appSettings.lastOpenedProblemId);
        }
        this.outputPanelComponent.appendOutput('info', this.t('dataSaved'));
      } else {
        this.outputPanelComponent.appendOutput('error', `${this.t('saveFailed')} ${this.currentProblemId}`);
      }
    }
    this.updateSaveButtonState();
  }

  // --- Editor Events ---
  private handleEditorContentChange(changes: SimplifiedContentChange[], cursorPosition: { lineNumber: number; column: number }, operationType: CodeEditEvent['operationType']): void {
    if (this.suppressDirtyFlag || !this.currentProblemId) {
      return;
    }

    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (problemData) {
      problemData.isDirty = true;
      problemData.content = this.monacoEditorComponent!.getValue();
      this.updateTitle();
      this.updateSaveButtonState();
    }

    if (this.currentProblemId) {
      for (const change of changes) {
        this.recordHistoryEvent({
          timestamp: Date.now(),
          problemId: this.currentProblemId,
          eventType: 'edit',
          operationType: operationType,
          change: change,
          cursorPosition: cursorPosition,
        });
      }
    }
  }

  // --- Output & Execution ---
  private async executeCode(): Promise<void> {
    if (!this.monacoEditorComponent || !this.currentProblemId) {
      this.outputPanelComponent.appendOutput('error', '请先选择一个题目。');
      return;
    }

    const code = this.monacoEditorComponent.getValue();
    this.clearOutput();
    await this.executeCodeSafely(this.currentProblemId, code);
  }

  private clearOutput(): void {
    this.outputPanelComponent.clearOutput();
    if (this.currentProblemId) {
      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.output = '';
      }
    }
  }

  private async executeCodeSafely(problemId: string, code: string): Promise<void> {
    this.outputPanelComponent.setProgramRunningState(true);

    try {
      await window.electron.compileAndRunCpp(problemId, code, this.EXECUTION_TIMEOUT);
    } catch (error: any) {
      this.outputPanelComponent.appendFriendlyError(error);
    } finally {
      this.outputPanelComponent.setProgramRunningState(false);
    }
    // Update workspace output
    if (this.currentProblemId) {
      const problemData = this.problemWorkspaceData.get(this.currentProblemId);
      if (problemData) {
        problemData.output = this.outputPanelComponent.getOutputContent();
      }
    }
  }

  private sendUserInput(input: string): void {
    if (this.currentProblemId) {
      window.electron.sendUserInput(this.currentProblemId, input);
    } else {
      this.outputPanelComponent.appendOutput('error', this.t('noProgramToReceiveInput'));
    }
  }

  // --- Audio Handling ---
  private handleAudioModified(audioBlob: Blob | null, audioUrl: string | null): void {
    if (!this.currentProblemId) return;
    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (problemData) {
      problemData.audioBlob = audioBlob;
      problemData.audioUrl = audioUrl;
      problemData.audioModified = true;
      this.updateTitle();
      this.updateSaveButtonState();
    }
  }

  // --- Navigation ---
  private navigateProblem(direction: -1 | 1): void {
    if (!this.currentProblemId) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblemId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < this.problems.length) {
      this.switchToProblem(this.problems[newIndex].id);
    }
  }

  // --- IPC Listeners ---
  private setupIpcListeners(): void {
    window.electron.onCppOutputChunk((chunk) => {
      this.outputPanelComponent.appendOutput(chunk.type, chunk.data);
      if (this.currentProblemId) {
        const problemData = this.problemWorkspaceData.get(this.currentProblemId);
        if (problemData) {
          problemData.output = this.outputPanelComponent.getOutputContent();
        }
      }
    });

    window.electron.onBeforeQuit(async () => {
      console.log('Renderer process: Received app-before-quit event.');
      await this.saveCurrentProblemToDisk();
      await this.saveAppSettings();
      console.log('Renderer process: Finished saving, acknowledging quit.');
      window.electron.sendAppQuitAcknowledged();
    });
  }

  // --- Keyboard Shortcuts ---
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        await this.saveCurrentProblemToDisk();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        await this.executeCode();
      }
    });
  }

  // --- Export/Import/Refresh ---
  private async openExportModal(): Promise<void> {
    if (this.currentProblemId) {
      await this.saveCurrentProblemToDisk();
      // Re-render problem list to ensure icons are updated before opening modal
      this.problemListComponent.updateProblems(this.problems, this.currentProblemId, this.appSettings.lastOpenedProblemId);
    }
    this.exportModalComponent.openModal(this.problems, this.currentProblemId);
  }

  private async handleConfirmExport(selectedProblemIds: string[]): Promise<void> {
    // 检查姓名和学号是否为空
    if (!this.appSettings.userName || !this.appSettings.userName.trim()) {
      this.outputPanelComponent.appendOutput('error', '导出失败：请先输入姓名');
      return;
    }
    
    if (!this.appSettings.studentId || !this.appSettings.studentId.trim()) {
      this.outputPanelComponent.appendOutput('error', '导出失败：请先输入学号');
      return;
    }

    this.outputPanelComponent.appendOutput('info', '正在准备导出...');
    try {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2); // 两位年份
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      const defaultFileName = `${this.appSettings.studentId}_${this.appSettings.userName}_${year}${month}${day}_${hours}${minutes}${seconds}.zip`;

      const result = await window.electron.exportProblemsToZip(selectedProblemIds, defaultFileName);

      if (result.success && result.filePath) {
        this.outputPanelComponent.appendOutput('result', `${this.t('exportSuccess')} ${result.filePath}`);
      } else {
        this.outputPanelComponent.appendOutput('error', `${this.t('exportFailed')} ${result.message || '未知错误'}`);
      }
    } catch (error) {
      console.error(this.t('exportFailed'), error);
      this.outputPanelComponent.appendOutput('error', `${this.t('exportFailed')} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleRefreshProblems(): Promise<void> {
    this.toolbarComponent.setRefreshButtonLoading(true);
    this.clearOutput();

    const problemsBeforeRefreshCount = this.problems.length;

    try {
      if (this.currentProblemId) {
        await this.saveCurrentProblemToDisk();
      }

      this.problems = await window.electron.refreshProblems();
      this.problemListComponent.updateProblems(this.problems, null, null); // Clear selection
      this.outputPanelComponent.appendOutput('info', this.t('refreshSuccess'));

      this.resetUIForProblemList();

    } catch (error) {
      console.error(this.t('refreshFailed'), error);
      this.outputPanelComponent.appendOutput('error', `${this.t('refreshFailed')} ${error instanceof Error ? error.message : String(error)}`);
      this.outputPanelComponent.appendOutput('info', '请检查是否能连接GitHub或使用导入功能更新题目！');
      // if (problemsBeforeRefreshCount > 0) {
      //   try {
      //     this.problems = await window.electron.getPureLocalProblems();
      //     this.problemListComponent.updateProblems(this.problems, null, null);
      //     this.outputPanelComponent.appendOutput('info', '已加载本地题目列表。');
      //   } catch (localLoadError) {
      //     console.error('加载本地题目列表失败:', localLoadError);
      //     this.outputPanelComponent.appendOutput('error', `加载本地题目列表失败: ${localLoadError instanceof Error ? localLoadError.message : String(localLoadError)}`);
      //   }
      // } else {
      //   this.problems = [];
      //   this.problemListComponent.updateProblems(this.problems, null, null);
      //   this.outputPanelComponent.appendOutput('info', '没有可用的题目列表。');
      // }
      this.resetUIForProblemList();
    } finally {
      this.toolbarComponent.setRefreshButtonLoading(false);
    }
  }

  private async handleImportProblems(): Promise<void> {
    if (this.currentProblemId) {
      await this.saveCurrentProblemToDisk();
    }
    this.clearOutput();

    try {
      const result = await window.electron.showOpenDialog([
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]);

      if (result && result.content) {
        const importResult = await window.electron.importProblems(result.content);

        if (importResult.success && importResult.problems) {
          this.problems = importResult.problems;
          this.problemListComponent.updateProblems(this.problems, null, null);
          this.outputPanelComponent.appendOutput('info', this.t('importSuccess', { count: importResult.problems.length - (importResult.invalidCount || 0), invalidCount: importResult.invalidCount || 0 }));
          this.resetUIForProblemList();
        } else {
          this.outputPanelComponent.appendOutput('error', `${this.t('importFailed')} ${importResult.error || this.t('importInvalidFormat')}`);
          try {
            this.problems = await window.electron.getPureLocalProblems();
            this.problemListComponent.updateProblems(this.problems, null, null);
            this.outputPanelComponent.appendOutput('info', '导入失败，已重新加载本地题目列表。');
            this.resetUIForProblemList();
          } catch (localLoadError) {
            console.error('导入失败后加载本地题目列表失败:', localLoadError);
            this.outputPanelComponent.appendOutput('error', `加载本地题目列表失败: ${localLoadError instanceof Error ? localLoadError.message : String(localLoadError)}`);
          }
        }
      } else {
        this.outputPanelComponent.appendOutput('info', '导入已取消。');
        this.resetUIForProblemList();
      }
    } catch (error) {
      console.error(this.t('importFailed'), error);
      this.outputPanelComponent.appendOutput('error', `${this.t('importFailed')} ${error instanceof Error ? error.message : String(error)}`);
      try {
        this.problems = await window.electron.getPureLocalProblems();
        this.problemListComponent.updateProblems(this.problems, null, null);
        this.outputPanelComponent.appendOutput('info', '导入操作发生错误，已重新加载本地题目列表。');
        this.resetUIForProblemList();
      } catch (localLoadError) {
        console.error('导入操作错误后加载本地题目列表失败:', localLoadError);
        this.outputPanelComponent.appendOutput('error', `加载本地题目列表失败: ${localLoadError instanceof Error ? localLoadError.message : String(localLoadError)}`);
      }
    }
  }

  private resetUIForProblemList(): void {
    this.currentProblemId = null;
    this.appSettings.lastOpenedProblemId = null;
    this.saveAppSettings(); // Persist the cleared lastOpenedProblemId

    this.monacoEditorComponent?.setValue(this.t('selectProblemEditor'));
    this.audioPanelComponent.toggleVisibility(false);
    this.updateTitle();
    this.updateSaveButtonState();
    this.problemListComponent.activateProblemListTab();
    this.problemDescriptionComponent.update(null, this.problems, this.currentProblemId); // Clear description
  }

  // --- Utility Methods ---
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

  private updateSaveButtonState(): void {
    if (!this.currentProblemId) {
      this.toolbarComponent.updateSaveButtonState(true);
      return;
    }

    const problemData = this.problemWorkspaceData.get(this.currentProblemId);
    if (problemData && (problemData.isDirty || problemData.audioModified)) {
      this.toolbarComponent.updateSaveButtonState(false);
    } else {
      this.toolbarComponent.updateSaveButtonState(true);
    }
  }

  private getWelcomeCode(): string {
    return `// 欢迎来到 DSALab! 🚀

#include <iostream>
#include <string>

int main() {
    std::cout << "Hello DSALab!" << std::endl;
    return 0;
}
`;
  }

  private t(key: keyof Translations, replacements?: { [key: string]: string | number }): string {
    const lang = this.currentLanguage;
    // 修复点：对整个表达式的结果进行类型断言
    let text: string = (this.translations[lang][key] || key) as string;

    if (replacements) {
      for (const rKey in replacements) {
        const placeholder = `{${rKey}}`;
        const replacementValue = String(replacements[rKey]);
        // 确保 replace 方法在 string 类型上调用
        text = (text as string).replace(placeholder, replacementValue);
      }
    }
    return text;
  }

  private recordHistoryEvent(event: HistoryEvent): void {
    if (!this.currentProblemId && event.eventType !== 'problem_loaded') {
      console.warn('Attempted to record history event without a currentProblemId:', event);
      return;
    }
    window.electron.recordHistoryEvent(event);
  }
}