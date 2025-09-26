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
import { Router } from '@angular/router';
import { DSALabProblemService } from '../../../services/dsalab-problem.service';
import { DSALabSettingsService } from '../../../services/dsalab-settings.service';
import { TabsService } from '../../../services/tabs.service';
import { ElectronService } from '../../../core/services';
import { Problem, DSALabSettings } from '../../../services/dsalab-types';

@Component({
  selector: 'app-problem-list',
  templateUrl: './problem-list.component.html',
  styleUrls: ['./problem-list.component.scss']
})
export class ProblemListComponent implements OnInit, OnDestroy {
  problems: Problem[] = [];
  currentProblem: Problem | null = null;
  settings: DSALabSettings = { userName: '', studentId: '', lastOpenedProblemId: null };
  
  private destroy$ = new Subject<void>();

  constructor(
    private dsalabService: DSALabProblemService,
    private settingsService: DSALabSettingsService,
    private tabsService: TabsService,
    private electronService: ElectronService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // 订阅问题列表变化
    this.dsalabService.problems$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problems => {
        this.problems = problems;
        console.log('Problems updated in component:', problems.length, problems);
        
        // 题目列表更新后，将最后打开的题目定位到中间
        setTimeout(() => {
          this.scrollToLastOpenedProblem();
        }, 100);
      });

    // 订阅当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        this.currentProblem = problem;
      });

    // 订阅设置变化
    this.settingsService.settings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        this.settings = settings;
        // 只更新设置，不自动导航
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 选择问题
  async selectProblem(problem: Problem): Promise<void> {
    console.log(`🎯 Selecting problem ${problem.id}, current: ${this.currentProblem?.id}`);
    
    if (problem.id === this.currentProblem?.id) {
      console.log(`📌 Same problem selected, only navigating to description page`);
      // 如果已经是当前问题，只跳转到题目描述页面，不做任何其他操作
      this.router.navigate([{
        outlets: {
          sidebar: 'problem-description'
        }
      }]);
      return;
    }

    console.log(`🔄 Switching to different problem: ${problem.id}`);

    try {
      // 先关闭当前DSALab标签页（如果存在）
      const currentTab = this.tabsService.getActive();
      if (currentTab.value && currentTab.value.key.startsWith('dsalab-')) {
        console.log(`🗂️ Closing current DSALab tab: ${currentTab.value.key}`);
        this.tabsService.remove(currentTab.value.key, true); // 强制删除
      }

      // 切换到新问题（这会自动保存当前问题并加载新问题）
      await this.dsalabService.switchToProblem(problem.id);
      
      // 获取切换后的工作区数据
      const workspaceData = this.dsalabService.getCurrentProblemWorkspaceData();
      if (workspaceData) {
        // 获取实际文件路径
        const workspaceRoot = await this.electronService.ipcRenderer.invoke('dsalab-get-workspace-root' as any);
        const actualFilePath = `${workspaceRoot}\\${problem.id}\\code.cpp`;
        
        // 创建新的标签页
        this.tabsService.add({
          key: `dsalab-${problem.id}`,
          type: 'file',
          title: problem.shortDescription, // 显示题目描述
          code: workspaceData.content,
          path: actualFilePath
        });

        // 激活新标签页
        this.tabsService.changeActive(`dsalab-${problem.id}`);
        
        console.log(`✅ Switched to problem ${problem.id}, loaded code length: ${workspaceData.content.length}`);
      }

      // 重要：跳转到题目描述页面
      this.router.navigate([{
        outlets: {
          sidebar: 'problem-description'
        }
      }]);

    } catch (error) {
      console.error('Failed to select problem:', error);
      // 这里可以添加错误提示
    }
  }

  // 检查问题是否有代码
  hasCode(problem: Problem): boolean {
    return !!problem.Code;
  }

  // 检查问题是否有音频
  hasAudio(problem: Problem): boolean {
    return !!problem.Audio;
  }

  // 检查问题是否被删除
  isDeleted(problem: Problem): boolean {
    return problem.isDelete;
  }

  // 检查是否为当前问题
  isCurrentProblem(problem: Problem): boolean {
    return this.currentProblem?.id === problem.id;
  }

  // 检查是否为上次打开的问题
  isLastOpenedProblem(problem: Problem): boolean {
    return this.settings.lastOpenedProblemId === problem.id;
  }

  // 将最后打开的题目定位到列表中间位置（学习导出页面的实现）
  private scrollToLastOpenedProblem(): void {
    if (!this.settings.lastOpenedProblemId) return;

    // 找到题目列表容器
    const problemListContainer = document.querySelector('.problem-list-content') as HTMLElement;
    if (!problemListContainer) return;

    // 找到最后打开的题目在原始顺序中的索引
    const lastOpenedProblemIndex = this.problems.findIndex(p => p.id === this.settings.lastOpenedProblemId);
    if (lastOpenedProblemIndex === -1) return;

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

      // 计算目标滚动位置，使最后打开的题目显示在中间
      const targetIndex = Math.max(0, lastOpenedProblemIndex - Math.floor(visibleItemsCount / 2));
      const targetScrollTop = targetIndex * itemHeight;

      // 直接设置滚动位置（不使用动画）
      problemListContainer.scrollTop = targetScrollTop;
      
      console.log(`📍 Positioned last opened problem ${this.settings.lastOpenedProblemId} to center of list`);
    }, 50);
  }

}
