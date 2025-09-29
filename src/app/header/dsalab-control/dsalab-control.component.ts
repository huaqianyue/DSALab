import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { DSALabProblemService } from '../../services/dsalab-problem.service';
import { DSALabSettingsService } from '../../services/dsalab-settings.service';
import { ElectronService } from '../../core/services';
import { TabsService } from '../../services/tabs.service';
import { Problem, DSALabSettings } from '../../services/dsalab-types';

@Component({
  selector: 'app-dsalab-control',
  templateUrl: './dsalab-control.component.html',
  styleUrls: ['./dsalab-control.component.scss']
})
export class DSALabControlComponent implements OnInit, OnDestroy {
  isRefreshing = false;
  isExporting = false;
  isSaving = false;
  problems: Problem[] = [];
  settings: DSALabSettings = { userName: '', studentId: '', lastOpenedProblemId: null };
  currentProblem: Problem | null = null;
  
  // 导出模态框相关
  exportModalVisible = false;
  selectedProblemIds: string[] = [];
  exportUserName = '';
  exportStudentId = '';
  
  private destroy$ = new Subject<void>();

  constructor(
    private dsalabService: DSALabProblemService,
    private settingsService: DSALabSettingsService,
    private electronService: ElectronService,
    private message: NzMessageService,
    private modal: NzModalService,
    private tabsService: TabsService
  ) { }

  ngOnInit(): void {
    // 订阅问题列表变化
    this.dsalabService.problems$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problems => {
        this.problems = problems;
        console.log('DSALabControl received problems:', problems.length, problems);
      });

    // 订阅设置变化
    this.settingsService.settings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        this.settings = settings;
      });

    // 订阅当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        this.currentProblem = problem;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 刷新问题列表
  async refreshProblems(): Promise<void> {
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    const hideMessage = this.message.loading('正在刷新问题列表...', { nzDuration: 0 });

    try {
      await this.dsalabService.refreshProblems();
      this.message.remove(hideMessage.messageId);
      this.message.success('问题列表刷新成功');
    } catch (error) {
      this.message.remove(hideMessage.messageId);
      this.message.error('刷新问题列表失败: ' + (error instanceof Error ? error.message : String(error)));
      console.error('Failed to refresh problems:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  // 导入问题
  async importProblems(): Promise<void> {
    try {
      const result = await this.electronService.ipcRenderer.invoke('file/openFile' as any, [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]);

      if (result && result.content) {
        const hideMessage = this.message.loading('正在导入问题...', { nzDuration: 0 });
        
        try {
          const importResult = await this.dsalabService.importProblems(result.content);
          this.message.remove(hideMessage.messageId);

          if (importResult.success && importResult.problems) {
            const validCount = importResult.problems.length - (importResult.invalidCount || 0);
            const invalidCount = importResult.invalidCount || 0;
            
            let successMsg = `导入成功！新增/更新 ${validCount} 个有效题目`;
            if (invalidCount > 0) {
              successMsg += `，跳过 ${invalidCount} 个无效题目`;
            }
            
            this.message.success(successMsg);
          } else {
            this.message.error('导入失败: ' + (importResult.error || '未知错误'));
          }
        } catch (error) {
          this.message.remove(hideMessage.messageId);
          this.message.error('导入失败: ' + (error instanceof Error ? error.message : String(error)));
          console.error('Failed to import problems:', error);
        }
      }
    } catch (error) {
      this.message.error('打开文件失败: ' + (error instanceof Error ? error.message : String(error)));
      console.error('Failed to open file dialog:', error);
    }
  }

  // 打开导出模态框
  async openExportModal(): Promise<void> {
    // 只在代码真正被修改时才保存当前题目（与切换题目逻辑一致）
    if (this.currentProblem) {
      const workspaceData = this.dsalabService.getCurrentProblemWorkspaceData();
      if (workspaceData && (workspaceData.isDirty || workspaceData.audioModified)) {
        await this.saveCurrentProblem();
        console.log('Auto-saved current problem before export (code/audio modified)');
      } else {
        console.log('Skipped auto-save before export (no modifications)');
      }
    }

    // 过滤出有内容的题目（完全按照DSALab的逻辑）
    const exportableProblems = this.problems.filter(problem => {
      // 不导出已删除的题目
      if (problem.isDelete) return false;
      
      // DSALab要求：必须同时有代码和音频才能导出
      const hasCode = problem.Code !== '';
      const hasAudio = problem.Audio !== '';
      
      return hasCode && hasAudio; // 必须同时有代码和音频
    });

    if (exportableProblems.length === 0) {
      this.message.warning('没有可导出的题目，请先完成一些题目的代码和录音（需要同时具备）');
      return;
    }

    console.log(`Found ${exportableProblems.length} exportable problems out of ${this.problems.length} total problems`);

    // 从设置中加载用户信息
    this.exportUserName = this.settings.userName || '';
    this.exportStudentId = this.settings.studentId || '';
    this.selectedProblemIds = [];
    
    // 默认选中当前题目（如果有内容可导出）- 完全按照DSALab的逻辑
    if (this.currentProblem) {
      const currentInExportable = exportableProblems.find(p => p.id === this.currentProblem!.id);
      if (currentInExportable) {
        this.selectedProblemIds.push(this.currentProblem.id);
      }
    }
    
    this.exportModalVisible = true;
    
    // 等待模态框渲染完成后，将当前题目定位到列表中间
    setTimeout(() => {
      this.scrollToCurrentProblem();
    }, 100);
  }

  // 关闭导出模态框
  closeExportModal(): void {
    this.exportModalVisible = false;
    this.selectedProblemIds = [];
  }

  // 将当前题目定位到列表中间位置（通过计算初始滚动位置）
  private scrollToCurrentProblem(): void {
    if (!this.currentProblem) return;

    // 找到题目列表容器
    const problemListContainer = document.querySelector('.export-modal-content .problem-list') as HTMLElement;
    if (!problemListContainer) return;

    // 找到当前题目在原始顺序中的索引
    const currentProblemIndex = this.problems.findIndex(p => p.id === this.currentProblem!.id);
    if (currentProblemIndex === -1) return;

    // 等待DOM完全渲染
    setTimeout(() => {
      const listItems = problemListContainer.querySelectorAll('.problem-item');
      if (listItems.length === 0) return;

      // 计算每个项目的高度
      const firstItem = listItems[0] as HTMLElement;
      const itemHeight = firstItem.offsetHeight + 
        parseInt(getComputedStyle(firstItem).marginBottom) + 
        parseInt(getComputedStyle(firstItem).marginTop);

      // 计算容器可见高度
      const containerHeight = problemListContainer.clientHeight;
      const visibleItemsCount = Math.floor(containerHeight / itemHeight);

      // 计算目标滚动位置，使当前题目显示在中间
      const targetIndex = Math.max(0, currentProblemIndex - Math.floor(visibleItemsCount / 2));
      const targetScrollTop = targetIndex * itemHeight;

      // 直接设置滚动位置（不使用动画）
      problemListContainer.scrollTop = targetScrollTop;
    }, 50);
  }

  // 确认导出
  async confirmExport(): Promise<void> {
    if (this.selectedProblemIds.length === 0) {
      this.message.warning('请选择要导出的题目');
      return;
    }

    if (!this.exportUserName.trim()) {
      this.message.warning('请输入您的姓名');
      return;
    }

    if (!this.exportStudentId.trim()) {
      this.message.warning('请输入您的学号');
      return;
    }

    this.isExporting = true;
    const hideMessage = this.message.loading('正在导出...', { nzDuration: 0 });

    try {
      // 保存用户信息到设置
      await this.settingsService.updateUserName(this.exportUserName.trim());
      await this.settingsService.updateStudentId(this.exportStudentId.trim());

      // 生成文件名
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      const defaultFileName = `${this.exportStudentId}_${this.exportUserName}_${year}${month}${day}_${hours}${minutes}${seconds}.zip`;

      const result = await this.dsalabService.exportProblems(this.selectedProblemIds, defaultFileName);
      
      this.message.remove(hideMessage.messageId);

      if (result.success && result.filePath) {
        this.message.success(`导出成功: ${result.filePath}`);
        this.closeExportModal();
      } else {
        this.message.error('导出失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      this.message.remove(hideMessage.messageId);
      this.message.error('导出失败: ' + (error instanceof Error ? error.message : String(error)));
      console.error('Failed to export problems:', error);
    } finally {
      this.isExporting = false;
    }
  }

  // 切换问题选择
  toggleProblemSelection(problemId: string): void {
    console.log('🔄 toggleProblemSelection called for:', problemId);
    
    const problem = this.problems.find(p => p.id === problemId);
    
    // 只允许选择有内容的题目
    if (!problem || problem.isDelete || !this.hasProblemContent(problem)) {
      console.warn('❌ Problem cannot be selected:', problemId, 'hasContent:', this.hasProblemContent(problem));
      this.message.warning('该题目没有可导出的内容（需要同时有代码和音频）');
      return;
    }

    const index = this.selectedProblemIds.indexOf(problemId);
    if (index > -1) {
      this.selectedProblemIds.splice(index, 1);
      console.log('➖ Deselected problem:', problemId);
    } else {
      this.selectedProblemIds.push(problemId);
      console.log('➕ Selected problem:', problemId);
    }
    
    console.log('📋 Current selected problems:', this.selectedProblemIds);
  }

  // 全选/全不选
  toggleSelectAll(): void {
    const exportableProblems = this.problems.filter(p => !p.isDelete && this.hasProblemContent(p));
    const exportableIds = exportableProblems.map(p => p.id);
    
    if (this.selectedProblemIds.length === exportableIds.length) {
      // 全不选
      this.selectedProblemIds = [];
    } else {
      // 全选（只选择有内容的题目）
      this.selectedProblemIds = [...exportableIds];
    }
  }

  // 检查是否全选
  isAllSelected(): boolean {
    const exportableProblems = this.problems.filter(p => !p.isDelete && this.hasProblemContent(p));
    return exportableProblems.length > 0 && this.selectedProblemIds.length === exportableProblems.length;
  }

  // 检查是否部分选择
  isIndeterminate(): boolean {
    const exportableProblems = this.problems.filter(p => !p.isDelete && this.hasProblemContent(p));
    return this.selectedProblemIds.length > 0 && this.selectedProblemIds.length < exportableProblems.length;
  }

  // 检查问题是否被选中
  isProblemSelected(problemId: string): boolean {
    return this.selectedProblemIds.includes(problemId);
  }

  // 检查问题是否有内容可导出（完全按照DSALab逻辑）
  hasProblemContent(problem: Problem): boolean {
    if (problem.isDelete) return false;
    
    // DSALab要求：必须同时有代码和音频才能导出
    const hasCode = problem.Code !== '';
    const hasAudio = problem.Audio !== '';
    
    return hasCode && hasAudio;
  }

  // 获取可导出的问题数量
  getExportableProblemsCount(): number {
    return this.problems.filter(p => !p.isDelete && this.hasProblemContent(p)).length;
  }

  // 保存当前问题
  async saveCurrentProblem(): Promise<void> {
    try {
      // 检查当前标签页是否为DSALab问题
      const activeTab = this.tabsService.getActive().value;
      if (activeTab && activeTab.key.startsWith('dsalab-')) {
        // 同步编辑器内容到标签页
        this.tabsService.syncActiveCode();
        
        // 更新DSALab服务中的代码内容
        this.dsalabService.updateCurrentProblemCode(activeTab.code);
        
        // 保存当前问题
        await this.dsalabService.saveCurrentProblem();
        
        // 标记标签页为已保存
        activeTab.saved = true;
        
        this.message.success('问题保存成功');
        console.log('DSALab problem saved successfully');
      } else {
        this.message.warning('当前没有打开DSALab问题');
      }
    } catch (error) {
      this.message.error('保存失败: ' + (error instanceof Error ? error.message : String(error)));
      console.error('Failed to save DSALab problem:', error);
    }
  }

  // 检查问题是否有测试状态
  hasTestStatus(problem: Problem): boolean {
    return !!(problem as any).testStatus && (problem as any).testStatus !== 'not_tested';
  }

  // 检查问题是否有测试分数
  hasTestScore(problem: Problem): boolean {
    return typeof (problem as any).testScore === 'number';
  }

  // 获取测试状态文本
  getTestStatusText(problem: Problem): string {
    const testStatus = (problem as any).testStatus;
    switch (testStatus) {
      case 'passed':
        return '✅ 通过';
      case 'failed':
        return '❌ 失败';
      default:
        return '';
    }
  }

  // 获取测试分数文本
  getTestScoreText(problem: Problem): string {
    const testScore = (problem as any).testScore;
    if (typeof testScore === 'number') {
      return `${testScore}分`;
    }
    return '';
  }

  // 获取测试状态标签颜色
  getTestStatusTagColor(problem: Problem): string {
    const testStatus = (problem as any).testStatus;
    switch (testStatus) {
      case 'passed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  }

  // 获取测试分数标签颜色
  getTestScoreTagColor(problem: Problem): string {
    const testScore = (problem as any).testScore;
    if (typeof testScore === 'number') {
      if (testScore >= 90) return 'success';
      if (testScore >= 70) return 'warning';
      if (testScore >= 60) return 'processing';
      return 'error';
    }
    return 'default';
  }
}