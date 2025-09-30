import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ElectronService } from '../core/services';
import { Problem, ProblemWorkspaceData, DSALabSettings, HistoryEvent } from './dsalab-types';
import { DSALabPathsService } from './dsalab-paths.service';
import { DSALabHistoryService } from './dsalab-history.service';
import { DebugService } from './debug.service';
import { DSALabSettingsService } from './dsalab-settings.service';

type AutoRefreshStatus = 'idle' | 'loading' | 'success' | 'failed';

@Injectable({
  providedIn: 'root'
})
export class DSALabProblemService {
  private problemsSubject = new BehaviorSubject<Problem[]>([]);
  private currentProblemSubject = new BehaviorSubject<Problem | null>(null);
  private workspaceDataMap = new Map<string, ProblemWorkspaceData>();
  private autoRefreshStatusSubject = new BehaviorSubject<AutoRefreshStatus>('idle');

  public problems$ = this.problemsSubject.asObservable();
  public currentProblem$ = this.currentProblemSubject.asObservable();
  public settings$ = this.settingsService.settings$;
  public autoRefreshStatus$ = this.autoRefreshStatusSubject.asObservable();

  constructor(
    private electronService: ElectronService,
    private pathsService: DSALabPathsService,
    private historyService: DSALabHistoryService,
    private debugService: DebugService,
    private settingsService: DSALabSettingsService
  ) {
    this.initializeService();
    this.setupCDNLoadedListener();
  }

  private async initializeService() {
    try {
      await this.loadProblems();
    } catch (error) {
      console.error('Failed to initialize DSALab service:', error);
    }
  }

  // 监听 CDN 加载相关事件
  private setupCDNLoadedListener(): void {
    // 监听开始加载
    this.electronService.ipcRenderer.on('ng:dsalab/cdn-loading', () => {
      console.log('🌐 开始自动获取题目...');
      this.autoRefreshStatusSubject.next('loading');
    });

    // 监听加载完成
    this.electronService.ipcRenderer.on('ng:dsalab/cdn-loaded', (event, mergedProblems: Problem[]) => {
      console.log('✅ CDN 加载完成，自动刷新题目列表');
      this.problemsSubject.next(mergedProblems);
      this.autoRefreshStatusSubject.next('success');
      // 3秒后重置状态
      setTimeout(() => this.autoRefreshStatusSubject.next('idle'), 3000);
    });

    // 监听加载失败
    this.electronService.ipcRenderer.on('ng:dsalab/cdn-failed', () => {
      console.log('⚠️ CDN 加载失败，继续使用本地题目');
      this.autoRefreshStatusSubject.next('failed');
      // 3秒后重置状态
      setTimeout(() => this.autoRefreshStatusSubject.next('idle'), 3000);
    });
  }

  // 加载问题列表（与原始DSALab一致）
  async loadProblems(): Promise<void> {
    try {
      const problems = await this.electronService.ipcRenderer.invoke('dsalab-get-problems' as any);
      this.problemsSubject.next(problems as Problem[]);
    } catch (error) {
      console.error('Failed to load problems:', error);
      throw error;
    }
  }

  // 加载纯本地问题列表（不合并CDN）
  async loadPureLocalProblems(): Promise<Problem[]> {
    try {
      return await this.electronService.ipcRenderer.invoke('dsalab-get-pure-local-problems' as any) as Problem[];
    } catch (error) {
      console.error('Failed to load pure local problems:', error);
      throw error;
    }
  }

  // 刷新问题列表
  async refreshProblems(): Promise<void> {
    try {
      const problems = await this.electronService.ipcRenderer.invoke('dsalab-refresh-problems' as any);
      this.problemsSubject.next(problems as Problem[]);
    } catch (error) {
      console.error('Failed to refresh problems:', error);
      throw error;
    }
  }

  // 导入问题
  async importProblems(jsonContent: string): Promise<{ success: boolean; problems?: Problem[]; invalidCount?: number; error?: string }> {
    try {
      const result = await this.electronService.ipcRenderer.invoke('dsalab-import-problems' as any, jsonContent);
      if ((result as any).success && (result as any).problems) {
        this.problemsSubject.next((result as any).problems);
      }
      return result as any;
    } catch (error) {
      console.error('Failed to import problems:', error);
      throw error;
    }
  }

  // 导出问题
  async exportProblems(problemIds: string[], defaultFileName: string): Promise<{ success: boolean; filePath?: string; message?: string }> {
    try {
      return await this.electronService.ipcRenderer.invoke('dsalab-export-problems' as any, problemIds, defaultFileName) as any;
    } catch (error) {
      console.error('Failed to export problems:', error);
      throw error;
    }
  }

  // 切换到指定问题
  async switchToProblem(problemId: string): Promise<void> {
    try {
      const problems = this.problemsSubject.value;
      const problem = problems.find(p => p.id === problemId);
      if (!problem) {
        throw new Error(`Problem with ID ${problemId} not found`);
      }

      // 检查是否是同一个题目
      const currentProblem = this.currentProblemSubject.value;
      const isSameProblem = currentProblem && currentProblem.id === problemId;
      
      if (isSameProblem) {
        console.log(`📌 Staying on same problem ${problemId}, keeping existing state`);
        // 相同题目，不做任何处理，直接返回
        return;
      }

      console.log(`🔄 Switching from ${currentProblem?.id || 'none'} to ${problemId}`);

      // 立即保存最后打开的题目ID（学习DSALab的策略）
      await this.settingsService.updateLastOpenedProblemId(problemId);
      console.log(`💾 Saved last opened problem ID: ${problemId}`);

      // 如果正在调试，先停止调试
      if (this.debugService.isDebugging$.value) {
        console.log('🛑 Stopping debug session before switching problems');
        this.debugService.exitDebug();
      }

      // 清除调试信息（控制台输出和断点）
      this.debugService.clearAllDebugInfo();

      // 保存当前问题的工作区数据
      if (currentProblem) {
        await this.saveProblemWorkspace(currentProblem.id);
      }

      // 加载新问题的工作区数据
      let workspaceData = this.workspaceDataMap.get(problemId);
      if (!workspaceData) {
        console.log(`Loading workspace data for problem ${problemId}`);
        workspaceData = await this.loadProblemWorkspace(problemId);
        this.workspaceDataMap.set(problemId, workspaceData);
      } else {
        console.log(`Using cached workspace data for problem ${problemId}`);
        // 对于缓存的数据，只在真正切换题目时才重新创建URL
        if (workspaceData.audioBlob) {
          console.log(`Refreshing audio URL for problem ${problemId}`);
          
          // 清理旧的URL（如果存在）
          if (workspaceData.audioUrl) {
            URL.revokeObjectURL(workspaceData.audioUrl);
            console.log(`Revoked old audio URL: ${workspaceData.audioUrl}`);
          }
          
          // 创建新的URL
          workspaceData.audioUrl = URL.createObjectURL(workspaceData.audioBlob);
          console.log(`Created fresh audio URL: ${workspaceData.audioUrl}`);
        } else {
          // 如果没有音频数据，确保URL也是null
          if (workspaceData.audioUrl) {
            URL.revokeObjectURL(workspaceData.audioUrl);
            workspaceData.audioUrl = null;
            console.log(`Cleared audio URL for problem without audio data`);
          }
        }
      }

      this.currentProblemSubject.next(problem);
      
      // 记录历史事件（使用专用服务）
      this.recordProblemLifecycleEvent(problemId, 'problem_loaded', workspaceData.content);

    } catch (error) {
      console.error('Failed to switch to problem:', error);
      throw error;
    }
  }

  // 加载问题工作区数据
  private async loadProblemWorkspace(problemId: string): Promise<ProblemWorkspaceData> {
    try {
      // 首先查找问题信息，判断是否应该加载本地文件
      const problems = this.problemsSubject.value;
      const problem = problems.find(p => p.id === problemId);
      
      let code: string;
      let audioBlob: Blob | null = null;
      let audioUrl: string | null = null;

      // 根据本地JSON中的Code字段决定是否加载本地文件
      if (problem && problem.Code) {
        console.log(`Loading existing code file for problem ${problemId}`);
        const loadedCode = await this.electronService.ipcRenderer.invoke('dsalab-read-problem-code' as any, problemId);
        code = loadedCode || this.getStudentDebugTemplate(problem) || this.getWelcomeCode();
      } else {
        console.log(`Using debug template for problem ${problemId} (no local file)`);
        code = this.getStudentDebugTemplate(problem) || this.getWelcomeCode();
      }

      // 根据本地JSON中的Audio字段决定是否加载本地音频
      if (problem && problem.Audio) {
        console.log(`Loading existing audio file for problem ${problemId}`);
        const audioArrayBuffer = await this.electronService.ipcRenderer.invoke('dsalab-read-problem-audio' as any, problemId);
        if (audioArrayBuffer) {
          console.log(`Received audio ArrayBuffer: ${audioArrayBuffer.byteLength} bytes`);
          // 使用与DSALab完全一致的MIME类型
          audioBlob = new Blob([audioArrayBuffer as any], { type: 'audio/webm' });
          audioUrl = URL.createObjectURL(audioBlob);
          console.log(`Created audio Blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        } else {
          console.log(`No audio data received for problem ${problemId}`);
        }
      }

      return {
        content: code,
        isDirty: false,
        output: '',
        audioBlob: audioBlob,
        audioUrl: audioUrl,
        filePath: null,
        audioModified: false,
      };
    } catch (error) {
      console.error('Failed to load problem workspace:', error);
      return {
        content: this.getWelcomeCode(),
        isDirty: false,
        output: '',
        audioBlob: null,
        audioUrl: null,
        filePath: null,
        audioModified: false,
      };
    }
  }

  // 保存问题工作区数据
  async saveProblemWorkspace(problemId: string): Promise<void> {
    try {
      const workspaceData = this.workspaceDataMap.get(problemId);
      if (!workspaceData || (!workspaceData.isDirty && !workspaceData.audioModified)) {
        return;
      }

      let audioDataForMain: ArrayBuffer | null = null;
      if (workspaceData.audioBlob) {
        audioDataForMain = await workspaceData.audioBlob.arrayBuffer();
      }

      const success = await this.electronService.ipcRenderer.invoke('dsalab-save-problem-workspace' as any, 
        problemId, workspaceData.content, audioDataForMain);

      if (success) {
        workspaceData.isDirty = false;
        workspaceData.audioModified = false;
        console.log(`Successfully saved problem ${problemId}`);

        // 更新问题列表中的状态（与原始DSALab一致）
        const problems = this.problemsSubject.value;
        const problemIndex = problems.findIndex(p => p.id === problemId);
        if (problemIndex !== -1) {
          const updatedProblem = { ...problems[problemIndex] };
          updatedProblem.Code = 'code.cpp';
          updatedProblem.Audio = workspaceData.audioBlob ? 'audio.webm' : '';
          problems[problemIndex] = updatedProblem;
          this.problemsSubject.next([...problems]);
          
          // 保存更新后的问题列表到本地
          try {
            await this.saveProblemsToLocal(problems);
          } catch (saveError) {
            console.warn('Failed to save updated problems list:', saveError);
          }
        }

        // 记录历史事件（使用专用服务）
        this.recordProblemLifecycleEvent(
          problemId, 
          'problem_saved', 
          workspaceData.content, 
          workspaceData.audioBlob ? 'present' : 'absent'
        );
      } else {
        throw new Error('Failed to save problem workspace');
      }
    } catch (error) {
      console.error('Failed to save problem workspace:', error);
      throw error;
    }
  }

  // 保存当前问题
  async saveCurrentProblem(): Promise<void> {
    const currentProblem = this.currentProblemSubject.value;
    if (!currentProblem) {
      console.log('No current problem to save');
      return;
    }
    
    await this.saveProblemWorkspace(currentProblem.id);
  }

  // 获取当前问题的工作区数据
  getCurrentProblemWorkspaceData(): ProblemWorkspaceData | null {
    const currentProblem = this.currentProblemSubject.value;
    if (!currentProblem) return null;
    return this.workspaceDataMap.get(currentProblem.id) || null;
  }

  // 获取当前问题ID（用于应用关闭时保存）
  getCurrentProblemId(): string | null {
    const currentProblem = this.currentProblemSubject.value;
    return currentProblem ? currentProblem.id : null;
  }


  // 更新当前问题的代码内容
  updateCurrentProblemCode(code: string): void {
    const currentProblem = this.currentProblemSubject.value;
    if (!currentProblem) return;

    let workspaceData = this.workspaceDataMap.get(currentProblem.id);
    if (!workspaceData) {
      workspaceData = {
        content: code,
        isDirty: true,
        output: '',
        audioBlob: null,
        audioUrl: null,
        filePath: null,
        audioModified: false,
      };
      this.workspaceDataMap.set(currentProblem.id, workspaceData);
    } else {
      workspaceData.content = code;
      
      // 关键：比较当前代码和初始代码，只有不同时才设置isDirty
      const initialCode = this.getInitialCodeForProblem(currentProblem.id);
      workspaceData.isDirty = code !== initialCode;
    }
  }

  // 获取题目的初始代码（用于比较是否被修改）
  private getInitialCodeForProblem(problemId: string): string {
    const problem = this.problemsSubject.value.find(p => p.id === problemId);
    if (!problem) return '';
    
    // 如果题目有本地保存的代码，使用本地代码作为初始代码
    if (problem.Code) {
      return problem.Code;
    }
    
    // 否则返回默认的C++模板代码
    return this.getDefaultCppTemplate();
  }

  // 获取默认的C++模板代码
  private getDefaultCppTemplate(): string {
    return `#include <iostream>
using namespace std;

int main() {
    // 在这里编写你的代码
    
    return 0;
}`;
  }

  // 更新当前问题的音频数据
  updateCurrentProblemAudio(audioBlob: Blob | null, audioUrl: string | null): void {
    const currentProblem = this.currentProblemSubject.value;
    if (!currentProblem) return;

    const workspaceData = this.workspaceDataMap.get(currentProblem.id);
    if (workspaceData) {
      workspaceData.audioBlob = audioBlob;
      workspaceData.audioUrl = audioUrl;
      workspaceData.audioModified = true;
    }
  }


  // 保存问题列表到本地
  async saveProblemsToLocal(problems?: Problem[]): Promise<void> {
    try {
      const problemsToSave = problems || this.problemsSubject.value;
      const result = await this.electronService.ipcRenderer.invoke('dsalab-save-problems-to-local' as any, problemsToSave);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save problems');
      }
    } catch (error) {
      console.error('Failed to save problems to local:', error);
      throw error;
    }
  }

  // 记录历史事件（使用专用的历史服务）
  recordHistoryEvent(event: HistoryEvent): void {
    try {
      this.electronService.ipcRenderer.send('dsalab-record-history' as any, event);
    } catch (error) {
      console.error('Failed to record history event:', error);
    }
  }

  // 使用历史服务记录问题生命周期事件
  recordProblemLifecycleEvent(
    problemId: string,
    eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched',
    codeSnapshot?: string,
    audioState?: 'present' | 'absent' | 'modified'
  ): void {
    this.historyService.recordProblemLifecycleEvent(problemId, eventType, codeSnapshot, audioState);
  }

  // 使用历史服务记录音频事件
  recordAudioEvent(
    problemId: string,
    eventType: 'audio_record_start' | 'audio_record_pause' | 'audio_record_resume' | 'audio_record_stop' | 'audio_play',
    durationMs?: number,
    audioSizeKB?: number
  ): void {
    this.historyService.recordAudioEvent(problemId, eventType, durationMs, audioSizeKB);
  }

  // 获取欢迎代码
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

  // 获取学生调试模板
  private getStudentDebugTemplate(problem: Problem): string | null {
    return (problem as any).studentDebugTemplate || null;
  }

  // 获取所有问题
  getProblems(): Problem[] {
    return this.problemsSubject.value;
  }

  // 获取当前问题
  getCurrentProblem(): Problem | null {
    return this.currentProblemSubject.value;
  }

  // 获取设置
  getSettings(): DSALabSettings {
    return this.settingsService.currentSettings;
  }

  // 获取路径服务
  getPathsService(): DSALabPathsService {
    return this.pathsService;
  }

  // 获取历史服务
  getHistoryService(): DSALabHistoryService {
    return this.historyService;
  }

  // 验证问题ID是否有效
  isValidProblemId(problemId: string): boolean {
    return this.pathsService.isValidProblemId(problemId);
  }

  // 获取工作区结构信息
  getWorkspaceStructureInfo() {
    return this.pathsService.getWorkspaceStructureInfo();
  }

  // 记录测试开始事件
  recordTestStartEvent(problemId: string, codeSnapshot: string): void {
    this.historyService.recordTestStartEvent(problemId, codeSnapshot);
  }

  // 记录测试结果事件
  recordTestResultEvent(problemId: string, testResult: any): void {
    this.historyService.recordTestResultEvent(problemId, testResult);
  }
}
