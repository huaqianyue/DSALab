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
  isRefreshing = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private dsalabService: DSALabProblemService,
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
      });

    // 订阅当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        this.currentProblem = problem;
      });

    // 订阅设置变化
    this.dsalabService.settings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        this.settings = settings;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 选择问题
  async selectProblem(problem: Problem): Promise<void> {
    if (problem.id === this.currentProblem?.id) {
      // 如果已经是当前问题，只跳转到题目描述页面
      this.router.navigate([{
        outlets: {
          sidebar: 'problem-description'
        }
      }]);
      return;
    }

    try {
      // 先关闭当前DSALab标签页（如果存在）
      const currentTab = this.tabsService.getActive();
      if (currentTab.value && currentTab.value.key.startsWith('dsalab-')) {
        this.tabsService.remove(currentTab.value.key);
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
          title: problem.shortDescription,
          code: workspaceData.content,
          path: actualFilePath
        });

        // 激活新标签页
        this.tabsService.changeActive(`dsalab-${problem.id}`);
        
        console.log(`Switched to problem ${problem.id}, loaded code length: ${workspaceData.content.length}`);
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

  // 刷新问题列表
  async refreshProblems(): Promise<void> {
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    try {
      await this.dsalabService.refreshProblems();
    } catch (error) {
      console.error('Failed to refresh problems:', error);
    } finally {
      this.isRefreshing = false;
    }
  }
}
