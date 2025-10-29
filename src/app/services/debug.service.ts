import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, EMPTY, firstValueFrom, Observable, Subject, throwError, TimeoutError } from 'rxjs';
import { GdbArray, GdbResponse, GdbVal } from '@gytx/tsgdbmi';
import { ElectronService } from '../core/services';
import { EditorBreakpointInfo, EditorService } from './editor.service';
import { FileService } from './file.service';
import { catchError, debounceTime, filter, switchMap, timeout } from 'rxjs/operators';
import { DSALabHistoryService } from './dsalab-history.service';

function escape(src: string) {
  return src.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

interface TraceLine { file: string; line: number }
export interface FrameInfo {
  file: string;
  line: number;
  func: string;
  level: number;
}

export interface BreakpointInfo {
  file: string;
  line: number;
  func?: string;
}

export interface GdbVarInfo {
  id: string;
  expression: string;
  value: string;
  expandable: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DebugService {

  isDebugging$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  private allOutput = "";
  private consoleOutput: BehaviorSubject<string> = new BehaviorSubject("");
  consoleOutput$: Observable<string> = this.consoleOutput.asObservable();

  private sourcePath: string;
  private initBreakpoints: EditorBreakpointInfo[] = [];

  // use this subject to set rate limit of "running"/"stopped" event.
  private traceLine: Subject<TraceLine | null> = new Subject();

  // private bkptList: Subject<BreakpointInfo[]> = new Subject();
  // bkptList$: Observable<BreakpointInfo[]> = this.bkptList.asObservable();
  editorBkptList: EditorBreakpointInfo[] = [];

  private requestResults: Subject<GdbResponse> = new Subject();

  programStop: BehaviorSubject<void> = new BehaviorSubject(undefined);
  localVariables$: Observable<GdbArray> = this.programStop.pipe(
    switchMap(() => this.getLocalVariables()),
    catchError(err => (alert(err), EMPTY))
  );
  callStack$: Observable<FrameInfo[]> = this.programStop.pipe(
    switchMap(() => this.getCallStack()),
    catchError(err => (alert(err), EMPTY))
  );

  private currentProblemId: string | null = null;

  private gdbStartupDetected = false; // 标记是否检测到 GDB 启动阶段
  private gdbStartupLineCount = 0;    // GDB 启动阶段的行数计数
  
  private lastStepTimestamp: number | null = null; // 最后一次单步操作的时间戳

  /**
   * 判断是否应该记录控制台输出到历史
   * 过滤掉 GDB 的启动信息
   */
  private shouldRecordConsoleOutput(output: string): boolean {
    // 检测 GDB 启动开始
    if (output.includes('GNU gdb') || output.includes('GNU GDB')) {
      this.gdbStartupDetected = true;
      this.gdbStartupLineCount = 0;
      return false;
    }

    // 如果在 GDB 启动阶段，继续过滤前 30 行输出
    if (this.gdbStartupDetected) {
      this.gdbStartupLineCount++;
      
      // GDB 启动信息通常在前 30 行内
      if (this.gdbStartupLineCount <= 30) {
        // 检测到 "Reading symbols" 说明启动信息结束
        if (output.includes('Reading symbols') || 
            output.includes('Starting program') ||
            output.match(/\[.*Thread.*\]/)) {
          this.gdbStartupDetected = false;
          this.gdbStartupLineCount = 0;
          return true; // 这一行保留
        }
        return false; // 前 30 行都过滤
      } else {
        // 超过 30 行，认为启动信息已结束
        this.gdbStartupDetected = false;
        this.gdbStartupLineCount = 0;
      }
    }

    return true;
  }

  constructor(
    private router: Router,
    private electronService: ElectronService,
    private fileService: FileService,
    private editorService: EditorService,
    private historyService: DSALabHistoryService) {

    this.electronService.ipcRenderer.on('ng:debug/debuggerStarted', () => {
      (async () => {
        this.consoleOutput.next("");
        // 重置 GDB 启动检测标志
        this.gdbStartupDetected = false;
        this.gdbStartupLineCount = 0;
        
        for (const breakInfo of this.initBreakpoints) {
          await this.sendMiRequest(`-break-insert ${this.bkptConditionCmd(breakInfo)} "${escape(this.sourcePath)}:${breakInfo.line}"`);
        }
        this.router.navigate([{
          outlets: {
            tools: 'debug'
          }
        }]);
        await this.sendMiRequest("-exec-run");
      })();
    });

    this.electronService.ipcRenderer.on('ng:debug/debuggerStopped', () => {
      this.exitCleaning();
    });

    this.electronService.ipcRenderer.on('ng:debug/console', (_, response: GdbResponse) => {
      const newstr = response.payload as string;
      this.consoleOutput.next(this.allOutput += newstr);
      
      // 记录调试控制台输出（过滤 GDB 启动信息）
      if (this.currentProblemId && newstr.trim() && this.shouldRecordConsoleOutput(newstr)) {
        this.historyService.recordDebugConsoleOutputEvent(this.currentProblemId, newstr);
      }
    });

    this.electronService.ipcRenderer.on('ng:debug/notify', (_, response: GdbResponse) => {
      if (response.message === "running") {
        // Program is running (continue or init start or restart)
        this.isDebugging$.next(true);
        this.traceLine.next(null);
      } else if (response.message === "stopped") {
        const reason = response.payload["reason"] as string;
        if (reason.startsWith("exited")) {
          // Program exited. Stop debugging
          const exitCode = response.payload["exit-code"] ? 
            Number.parseInt(response.payload["exit-code"] as string) : undefined;
          
          // 程序退出，记录退出事件
          if (this.currentProblemId) {
            this.historyService.recordDebugStateChangeEvent(
              this.currentProblemId,
              'debug_program_exited',
              reason,
              undefined,
              exitCode
            );
          }
          
          this.sendMiRequest("-gdb-exit");
          this.exitCleaning();
        } else if (["breakpoint-hit", "end-stepping-range", "function-finished"].includes(reason)) {
          // Program stopped during step-by-step debugging
          console.log(response.payload);
          if ("file" in response.payload["frame"]) {
            const stopFile = response.payload["frame"]["file"] as string;
            const stopLine = Number.parseInt(response.payload["frame"]["line"] as string);
            this.traceLine.next({ file: stopFile, line: stopLine });
            this.programStop.next();
            
            // 获取该行的代码内容
            const codeAtLine = this.getCodeAtLine(stopLine);
            
            // 记录程序停止位置（作为补充信息）
            if (this.currentProblemId && this.lastStepTimestamp && (Date.now() - this.lastStepTimestamp < 5000)) {
              // 如果距离上次单步操作不到5秒，认为这次停止是由单步操作引起的
              // 记录停止位置信息
              this.historyService.recordDebugStateChangeEvent(
                this.currentProblemId,
                'debug_program_stopped',
                reason,
                { file: stopFile, line: stopLine, code: codeAtLine }
              );
            }
          }
        }
      } else {
        console.log(response);
      }
    });

    this.electronService.ipcRenderer.on("ng:debug/result", (_, response: GdbResponse) => {
      this.requestResults.next(response);
    });

    this.traceLine.pipe(
      debounceTime(100)
    ).subscribe(value => {
      if (value === null) this.editorService.hideTrace();
      else this.fileService.locate(value.file, value.line, 1, "debug");
    });

    this.editorService.breakpointInfos$.subscribe(value => {
      this.editorBkptList = value;
    });
  }

  private exitCleaning(): void {
    this.isDebugging$.next(false);
    this.traceLine.next(null);
    this.programStop.next();
  }

  // 清除调试控制台输出
  clearConsoleOutput(): void {
    this.allOutput = "";
    this.consoleOutput.next("");
    console.log('🧹 Debug console output cleared');
  }

  // 清除编辑器断点信息
  clearBreakpoints(): void {
    if (this.editorService) {
      // 清除编辑器中的断点装饰
      this.editorService.clearAllBreakpoints();
      console.log('🧹 All breakpoints cleared');
    }
    
    // 直接清除调试面板中的断点列表
    this.editorBkptList = [];
    console.log('🧹 Debug panel breakpoint list cleared');
  }

  // 清除所有调试信息（控制台输出 + 断点）
  clearAllDebugInfo(): void {
    console.log('🧹 Starting to clear all debug information...');
    console.log('🧹 Current editorBkptList length:', this.editorBkptList.length);
    
    this.clearConsoleOutput();
    this.clearBreakpoints();
    
    console.log('🧹 After clearing - editorBkptList length:', this.editorBkptList.length);
    console.log('🧹 All debug information cleared');
  }

  private bkptConditionCmd(info: EditorBreakpointInfo) {
    const cmds: string[] = [];
    if (info.expression !== null) {
      cmds.push(`-c "${escape(info.expression)}"`);
    }
    if (info.hitCount !== null) {
      cmds.push(`-i ${info.hitCount}`);
    }
    return cmds.join(' ');
  }

  private sendMiRequest(command: string): Promise<GdbResponse> {
    const token = Math.floor(Math.random() * 1000000);
    this.electronService.ipcRenderer.invoke("debug/sendRequest", {
      command: `${token}${command}`
    });
    return firstValueFrom(this.requestResults.pipe(
      filter(result => result.token === token),
      timeout(2000),
      catchError(err => {
        if (err instanceof TimeoutError) {
          window.alert("GDB 未响应。调试将退出。");
          this.exitDebug();
          return EMPTY;
        } else {
          return throwError(() => err);
        }
      })
    ));
  }

  async startDebug() {
    this.sourcePath = await this.fileService.saveOnNeed();
    if (this.sourcePath === null) return;
    this.initBreakpoints = this.editorBkptList;
    
    // 获取当前代码快照用于历史记录
    const codeSnapshot = this.editorService.getCode();
    
    this.electronService.ipcRenderer.invoke('debug/start', {
      srcPath: this.sourcePath
    }).then(r => {
      if (r.success === false) {
        alert(r.error);
        // 编译失败不需要额外记录，按钮点击已在 component 中记录
      } else {
        // 记录调试成功启动事件
        if (this.currentProblemId) {
          this.historyService.recordDebugControlEvent(
            this.currentProblemId,
            'debug_start',
            codeSnapshot
          );
        }
      }
    });
  }
  exitDebug() {
    // 记录调试退出事件
    if (this.currentProblemId) {
      this.historyService.recordDebugControlEvent(
        this.currentProblemId,
        'debug_exit'
      );
    }
    
    this.electronService.ipcRenderer.invoke('debug/exit');
  }

  async sendCommand(command: string): Promise<GdbResponse> {
    const result = await this.sendMiRequest(`-interpreter-exec console "${escape(command)}"`);
    
    // 记录调试命令事件
    if (this.currentProblemId) {
      this.historyService.recordDebugCommandEvent(
        this.currentProblemId,
        command,
        result.message !== "error"
      );
    }
    
    return result;
  }

  debugContinue() {
    // 立即记录单步操作（不包含停止位置，停止位置会在程序停止时补充）
    if (this.currentProblemId) {
      this.lastStepTimestamp = Date.now();
      this.historyService.recordDebugStepEvent(
        this.currentProblemId,
        'continue'
      );
    }
    return this.sendMiRequest("-exec-continue");
  }
  debugStepover() {
    // 立即记录单步操作
    if (this.currentProblemId) {
      this.lastStepTimestamp = Date.now();
      this.historyService.recordDebugStepEvent(
        this.currentProblemId,
        'stepover'
      );
    }
    return this.sendMiRequest("-exec-next");
  }
  debugStepinto() {
    // 立即记录单步操作
    if (this.currentProblemId) {
      this.lastStepTimestamp = Date.now();
      this.historyService.recordDebugStepEvent(
        this.currentProblemId,
        'stepinto'
      );
    }
    return this.sendMiRequest("-exec-step");
  }
  debugStepout() {
    // 立即记录单步操作
    if (this.currentProblemId) {
      this.lastStepTimestamp = Date.now();
      this.historyService.recordDebugStepEvent(
        this.currentProblemId,
        'stepout'
      );
    }
    return this.sendMiRequest("-exec-finish");
  }
  debugRestart() {
    // 立即记录重启操作
    if (this.currentProblemId) {
      this.lastStepTimestamp = Date.now();
      this.historyService.recordDebugStepEvent(
        this.currentProblemId,
        'restart'
      );
    }
    return this.sendMiRequest("-exec-run");
  }

  async evalExpr(expr: string): Promise<string> {
    const result = await this.sendMiRequest(`-data-evaluate-expression "${escape(expr)}"`);
    const resultValue = result.message !== "error" ? result.payload["value"] : result.payload["msg"];
    
    // 记录表达式求值事件
    if (this.currentProblemId) {
      this.historyService.recordDebugExpressionEvalEvent(
        this.currentProblemId,
        expr,
        resultValue
      );
    }
    
    return resultValue;
  }

  changeBkptCondition(id: string, expression: string) {
    this.editorService.changeBkptCondition(id, expression);
  }

  locateEditorBreakpoint(line: number) {
    this.editorService.setPosition({
      lineNumber: line,
      column: 1
    });
  }

  async getCallStack(): Promise<FrameInfo[]> {
    if (!this.isDebugging$.value) return [];
    const result = await this.sendMiRequest("-stack-list-frames");
    if (result.message !== "error") {
      return (result.payload["stack"] as GdbArray).map<FrameInfo>(value => ({
        file: value["file"],
        line: Number.parseInt(value["line"]),
        func: value["func"],
        level: Number.parseInt(value["level"])
      }));
    } else {
      return Promise.reject(result.payload["msg"]);
    }
  }

  async getLocalVariables(): Promise<GdbArray> {
    if (!this.isDebugging$.value) return [];
    const result = await this.sendMiRequest("-stack-list-variables --all-values");
    if (result.message !== "error") {
      return result.payload["variables"];
    } else {
      return Promise.reject(result.payload["msg"]);
    }
  }

  private isVariableExpandable(x: GdbVal) {
    return !!(x["dynamic"] ?? x["numchild"] !== "0");
  }

  async createVariables(origin: GdbVarInfo[]): Promise<GdbVarInfo[]> {
    if (!this.isDebugging$.value) return [];
    return Promise.all(origin.map(async o => {
      const result = await this.sendMiRequest(`-var-create ${o.id} @ (${o.expression})`);
      if (result.message === "error") return null;
      else return {
        id: result.payload["name"],
        expression: o.expression,
        value: result.payload["value"] ?? "",
        expandable: this.isVariableExpandable(result.payload)
      } as GdbVarInfo;
    }));
  }

  async getVariableChildren(variableId: string): Promise<GdbVarInfo[]> {
    if (!this.isDebugging$.value) return [];
    const result = await this.sendMiRequest(`-var-list-children --all-values ${variableId}`);
    if (result.message === "error") return Promise.reject();
    const children = result.payload["children"] as GdbArray;
    if (typeof children === "undefined") return [];
    return children.map(val => ({
      id: val["name"],
      expression: val["exp"],
      value: val["value"] ?? "",
      expandable: this.isVariableExpandable(val)
    }));
  }

  async updateVariables(origin: GdbVarInfo[]) {
    const deleteList: string[] = [];
    const collapseList: string[] = [];
    if (!this.isDebugging$.value) return { deleteList: origin.map(v => v.id), collapseList };
    const result = await this.sendMiRequest('-var-update --all-values *');
    if (result.message === "error") return { deleteList, collapseList };
    const changeList = result.payload["changelist"] as GdbArray;
    for (const change of changeList) {
      if (change["in_scope"] !== "true") {
        deleteList.push(change["name"]);
        continue;
      }
      if (change["new_num_children"]) {
        collapseList.push(change["name"]);
      }
      const target = origin.find(o => o.id === change["name"]);
      target.value = change["value"];
    }
    return { deleteList, collapseList };
  }

  deleteVariable(variableId: string, childrenOnly = false) {
    if (this.isDebugging$.value) this.sendMiRequest(`-var-delete ${childrenOnly ? '-c' : ''} ${variableId}`);
  }

  /**
   * 设置当前问题ID，用于历史记录
   * @param problemId 问题ID
   */
  setCurrentProblemId(problemId: string | null): void {
    this.currentProblemId = problemId;
  }

  /**
   * 获取指定行的代码内容
   * @param lineNumber 行号
   * @returns 该行的代码内容，如果获取失败则返回 undefined
   */
  private getCodeAtLine(lineNumber: number): string | undefined {
    try {
      const code = this.editorService.getCode();
      if (!code) return undefined;
      
      const lines = code.split('\n');
      if (lineNumber > 0 && lineNumber <= lines.length) {
        return lines[lineNumber - 1].trim(); // 行号从1开始，数组从0开始
      }
    } catch (error) {
      console.error('Failed to get code at line:', error);
    }
    return undefined;
  }

  /**
   * 记录断点添加事件
   * @param line 行号
   * @param fileName 文件名
   * @param condition 断点条件
   * @param hitCount 命中次数
   */
  recordBreakpointAdd(line: number, fileName: string, condition?: string, hitCount?: number): void {
    if (this.currentProblemId) {
      this.historyService.recordDebugBreakpointEvent(
        this.currentProblemId,
        'breakpoint_add',
        line,
        fileName,
        condition,
        hitCount
      );
    }
  }

  /**
   * 记录断点删除事件
   * @param line 行号
   * @param fileName 文件名
   */
  recordBreakpointRemove(line: number, fileName: string): void {
    if (this.currentProblemId) {
      this.historyService.recordDebugBreakpointEvent(
        this.currentProblemId,
        'breakpoint_remove',
        line,
        fileName
      );
    }
  }

  /**
   * 记录断点条件修改事件
   * @param line 行号
   * @param fileName 文件名
   * @param condition 新的断点条件
   */
  recordBreakpointConditionChange(line: number, fileName: string, condition?: string): void {
    if (this.currentProblemId) {
      this.historyService.recordDebugBreakpointEvent(
        this.currentProblemId,
        'breakpoint_condition_change',
        line,
        fileName,
        condition
      );
    }
  }
}
