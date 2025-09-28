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

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { NzNotificationDataOptions, NzNotificationService } from 'ng-zorro-antd/notification';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ElectronService } from '../core/services';
import { BuildResult, GccDiagnostics } from '../core/ipcTyping';
import { FileService } from './file.service';
import { ProblemsService } from './problems.service';
import { TabsService } from './tabs.service';
import { BehaviorSubject } from 'rxjs';
import { DSALabProblemService } from './dsalab-problem.service';

@Injectable({
  providedIn: 'root'
})
export class BuildService {

  isBuilding$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private notifyOption: NzNotificationDataOptions = {
    nzDuration: 3000
  };

  constructor(
    private router: Router,
    private electronService: ElectronService,
    private notification: NzNotificationService,
    private message: NzMessageService,
    private fileService: FileService,
    private problemsService: ProblemsService,
    private tabsService: TabsService,
    private dsalabProblemService: DSALabProblemService
  ) {
    this.electronService.ipcRenderer.on("ng:build/buildStarted", (_) => {
      this.isBuilding$.next(true);
    });
    this.electronService.ipcRenderer.on("ng:build/buildComplete", (_, result) => {
      this.isBuilding$.next(false);
      console.log("Compile result: ", result);
      if (result.success) {
        if (result.diagnostics.length === 0) {
          this.message.success("编译成功");
          this.problemsService.linkerr.next("");
          this.problemsService.problems.next([]);
        } else {
          this.showProblems(result.diagnostics);
          this.message.warning("编译成功，但存在警告");
        }
      } else {
        // 记录DSALab问题的编译错误历史
        const activeTab = this.tabsService.getActive().value;
        if (activeTab && activeTab.key.startsWith('dsalab-')) {
          const problemId = activeTab.key.replace('dsalab-', '');
          const errorMessage = result.diagnostics.map(d => d.message).join('\n');
          this.dsalabProblemService.getHistoryService().recordProgramRunEndEvent(
            problemId,
            'compile_error',
            false,
            null,
            null,
            undefined,
            errorMessage
          );
        }
        
        switch (result.stage) {
          case "compile":
            this.showProblems(result.diagnostics);
            this.message.error("编译错误");
            break;
          case "link":
            this.showProblems(result.diagnostics);
            this.message.error("链接错误");
            this.showOutput(result);
            break;
          default:
            this.showOutput(result);
            this.message.error("未知错误");
            break;
        }
      }
    });

    // 监听程序运行结束事件（用于DSALab历史记录）
    this.electronService.ipcRenderer.on('ng:program/exit', (_, data) => {
      const activeTab = this.tabsService.getActive().value;
      if (activeTab && activeTab.key.startsWith('dsalab-') && activeTab.path === data.path) {
        const problemId = activeTab.key.replace('dsalab-', '');
        this.dsalabProblemService.getHistoryService().recordProgramRunEndEvent(
          problemId,
          'run_end',
          data.exitCode === 0,
          data.exitCode,
          data.signal,
          data.durationMs
        );
      }
    });

    // 监听程序运行错误事件（用于DSALab历史记录）
    this.electronService.ipcRenderer.on('ng:program/error', (_, data) => {
      const activeTab = this.tabsService.getActive().value;
      if (activeTab && activeTab.key.startsWith('dsalab-') && activeTab.path === data.path) {
        const problemId = activeTab.key.replace('dsalab-', '');
        this.dsalabProblemService.getHistoryService().recordProgramRunEndEvent(
          problemId,
          'run_end',
          false,
          null,
          null,
          data.durationMs,
          data.error
        );
      }
    });
  }

  private showProblems(diagnostics: GccDiagnostics) {
    this.router.navigate([{
      outlets: {
        tools: 'problems'
      }
    }]);
    this.problemsService.problems.next(diagnostics);
  }
  private showOutput(result: BuildResult) {
    this.router.navigate([{
      outlets: {
        tools: 'output'
      }
    }]);
    if (result.stage === "unknown") {
      this.problemsService.unknownerr.next(`Error: ${result.what.error as string}\n\nstderr: ${result.what.stderr}`);
    } else if (result.stage === "link") {
      this.problemsService.linkerr.next(result.linkerr);
    }
  }

  private sendBuildRequest(srcPath: string) {
    console.log("sending request");
    this.electronService.ipcRenderer.invoke("build/build", {
      path: srcPath
    });
  }

  private sendRunExeRequest(srcPath: string, forceCompile: boolean) {
    this.electronService.ipcRenderer.invoke("build/runExe", {
      path: srcPath,
      forceCompile
    });
  }

  async compile(): Promise<void> {
    // 检查当前标签页是否为DSALab问题
    const activeTab = this.tabsService.getActive().value;
    if (activeTab && activeTab.key.startsWith('dsalab-')) {
      // DSALab问题：需要先保存当前编辑器内容到文件，然后再编译
      try {
        // 同步编辑器内容到标签页
        this.tabsService.syncActiveCode();
        
        // 更新DSALab服务中的代码内容
        this.dsalabProblemService.updateCurrentProblemCode(activeTab.code);
        
        // 保存当前问题到文件
        await this.dsalabProblemService.saveCurrentProblem();
        
        // 标记标签页为已保存
        activeTab.saved = true;
        
        console.log('DSALab problem saved before compilation');
        
        // 现在编译
        if (activeTab.path) {
          this.sendBuildRequest(activeTab.path);
        } else {
          console.error('DSALab tab has no path');
        }
      } catch (error) {
        console.error('Failed to save DSALab problem before compilation:', error);
        // 即使保存失败，也尝试编译（使用旧的文件内容）
        if (activeTab.path) {
          this.sendBuildRequest(activeTab.path);
        }
      }
    } else {
      // 普通文件：使用原有逻辑
      const srcPath = await this.fileService.saveOnNeed();
      if (srcPath !== null)
        this.sendBuildRequest(srcPath);
    }
  }

  async runTest(): Promise<void> {
    // 检查当前标签页是否为DSALab问题
    const activeTab = this.tabsService.getActive().value;
    if (activeTab && activeTab.key.startsWith('dsalab-')) {
      try {
        // 同步编辑器内容到标签页
        this.tabsService.syncActiveCode();
        
        // 更新DSALab服务中的代码内容
        this.dsalabProblemService.updateCurrentProblemCode(activeTab.code);
        
        // 保存当前问题到文件
        await this.dsalabProblemService.saveCurrentProblem();
        
        // 标记标签页为已保存
        activeTab.saved = true;
        
        console.log('DSALab problem saved before testing');
        
        // 运行测试
        const problemId = activeTab.key.replace('dsalab-', '');
        const result = await this.electronService.ipcRenderer.invoke('dsalab-run-test' as any, problemId) as any;
        
        if (result.success) {
          // 显示测试结果
          this.router.navigate([{
            outlets: {
              tools: 'test-results'
            }
          }]);
          
          // 通过服务传递测试结果
          (window as any).lastTestResult = result;
          
          this.message.success(`测试完成: ${result.passedTests}/${result.totalTests} 通过`);
        } else {
          this.message.error(`测试失败: ${result.error}`);
          
          // 也显示测试面板，显示错误信息
          this.router.navigate([{
            outlets: {
              tools: 'test-results'
            }
          }]);
          (window as any).lastTestResult = result;
        }
        
      } catch (error) {
        console.error('Failed to run DSALab test:', error);
        this.message.error('测试执行失败');
      }
    } else {
      this.message.warning('当前不是DSALab题目，无法运行测试');
    }
  }

  async runExe(forceCompile = false): Promise<void> {
    // 检查当前标签页是否为DSALab问题
    const activeTab = this.tabsService.getActive().value;
    if (activeTab && activeTab.key.startsWith('dsalab-')) {
      // DSALab问题：需要先保存当前编辑器内容到文件，然后再运行
      try {
        // 同步编辑器内容到标签页
        this.tabsService.syncActiveCode();
        
        // 更新DSALab服务中的代码内容
        this.dsalabProblemService.updateCurrentProblemCode(activeTab.code);
        
        // 保存当前问题到文件
        await this.dsalabProblemService.saveCurrentProblem();
        
        // 标记标签页为已保存
        activeTab.saved = true;
        
        console.log('DSALab problem saved before running');
        
        // 记录程序运行开始历史（使用最新的代码内容）
        const problemId = activeTab.key.replace('dsalab-', '');
        this.dsalabProblemService.getHistoryService().recordProgramRunStartEvent(
          problemId, 
          activeTab.code
        );
        
        // 现在运行
        if (activeTab.path) {
          this.sendRunExeRequest(activeTab.path, forceCompile);
        } else {
          console.error('DSALab tab has no path');
        }
      } catch (error) {
        console.error('Failed to save DSALab problem before running:', error);
        // 即使保存失败，也尝试运行（使用旧的文件内容）
        const problemId = activeTab.key.replace('dsalab-', '');
        const workspaceData = this.dsalabProblemService.getCurrentProblemWorkspaceData();
        if (workspaceData) {
          this.dsalabProblemService.getHistoryService().recordProgramRunStartEvent(
            problemId, 
            workspaceData.content
          );
        }
        
        if (activeTab.path) {
          this.sendRunExeRequest(activeTab.path, forceCompile);
        }
      }
    } else {
      // 普通文件：使用原有逻辑
      const srcPath = await this.fileService.saveOnNeed();
      if (srcPath !== null)
        this.sendRunExeRequest(srcPath, forceCompile);
    }
  }
}
