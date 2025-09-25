// Copyright (C) 2021 Guyutongxue
//
// This file is part of Dev-C++ 7.
//
// Dev-C++ 7 is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Dev-C++ 7 is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Dev-C++ 7.  If not, see <http://www.gnu.org/licenses/>.

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { DSALabProblemService } from '../../services/dsalab-problem.service';
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
    this.dsalabService.settings$
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
  openExportModal(): void {
    if (this.problems.length === 0) {
      this.message.warning('没有可导出的题目');
      return;
    }

    // 重置导出信息
    this.exportUserName = '';
    this.exportStudentId = '';
    this.selectedProblemIds = [];
    this.exportModalVisible = true;
  }

  // 关闭导出模态框
  closeExportModal(): void {
    this.exportModalVisible = false;
    this.selectedProblemIds = [];
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
      // 生成文件名
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      const defaultFileName = `${this.exportStudentId}_${this.exportUserName}_${year}${month}${day}_${hours}${minutes}${seconds}`;

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
    const index = this.selectedProblemIds.indexOf(problemId);
    if (index > -1) {
      this.selectedProblemIds.splice(index, 1);
    } else {
      this.selectedProblemIds.push(problemId);
    }
  }

  // 全选/全不选
  toggleSelectAll(): void {
    const availableProblems = this.problems.filter(p => !p.isDelete);
    const availableIds = availableProblems.map(p => p.id);
    
    if (this.selectedProblemIds.length === availableIds.length) {
      // 全不选
      this.selectedProblemIds = [];
    } else {
      // 全选
      this.selectedProblemIds = [...availableIds];
    }
  }

  // 检查是否全选
  isAllSelected(): boolean {
    const availableProblems = this.problems.filter(p => !p.isDelete);
    return availableProblems.length > 0 && this.selectedProblemIds.length === availableProblems.length;
  }

  // 检查是否部分选择
  isIndeterminate(): boolean {
    const availableProblems = this.problems.filter(p => !p.isDelete);
    return this.selectedProblemIds.length > 0 && this.selectedProblemIds.length < availableProblems.length;
  }

  // 检查问题是否被选中
  isProblemSelected(problemId: string): boolean {
    return this.selectedProblemIds.includes(problemId);
  }

  // 检查问题是否有内容可导出
  hasProblemContent(problem: Problem): boolean {
    return !!(problem.Code || problem.Audio);
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
}