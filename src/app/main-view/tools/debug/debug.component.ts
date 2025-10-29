import { AfterViewChecked, Component, ElementRef, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import * as path from 'path';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { DebugService, FrameInfo } from '../../../services/debug.service';
import { EditorBreakpointInfo } from '../../../services/editor.service';
import { FileService } from '../../../services/file.service';
import { DSALabHistoryService } from '../../../services/dsalab-history.service';
import { DSALabProblemService } from '../../../services/dsalab-problem.service';

@Component({
  selector: 'app-debug',
  templateUrl: './debug.component.html',
  styleUrls: ['./debug.component.scss']
})
export class DebugComponent implements OnInit, AfterViewChecked {

  constructor(
    private fileService: FileService,
    private debugService: DebugService,
    private historyService: DSALabHistoryService,
    private problemService: DSALabProblemService) { }

  @ViewChild("cOutput") private cOutput: ElementRef;

  selectedIndex: number = 0;

  isDebugging$: Observable<boolean>;

  expr: string = "";
  exprVal: string = "";

  consoleOutput$: Observable<string>;
  promptColor: string = "#262626";
  consoleInput: string = "";
  consoleInputEnabled = true;

  callStack$: Observable<FrameInfo[]>;
  // bkptList: FrameInfo[] = [];

  currentEditBkptline: number = null;
  currentEditValue: string = "";

  get enabled(): boolean {
    return this.fileService.currentFileType() !== "none";
  }

  getEditorBreakpoints() {
    return this.debugService.editorBkptList;
  }

  ngOnInit(): void {
    this.consoleOutput$ = this.debugService.consoleOutput$;
    this.isDebugging$ = this.debugService.isDebugging$.pipe(tap(value => {
      if (value) this.promptColor = "#262626";
    }));
    this.callStack$ = this.debugService.callStack$;
  }

  ngAfterViewChecked(): void {    
    try {
      this.cOutput.nativeElement.scrollTop = this.cOutput.nativeElement.scrollHeight;
    } catch (_) { }
  }

  startDebug() {
    // 立即记录用户点击调试按钮事件（无论编译成功与否都记录点击）
    this.problemService.currentProblem$.subscribe(currentProblem => {
      if (currentProblem) {
        this.historyService.recordDebugControlEvent(
          currentProblem.id,
          'debug_button_clicked'
        );
      }
    }).unsubscribe();
    
    // 调用调试服务（成功时会记录 debug_start）
    this.debugService.startDebug();
  }

  exitDebug() {
    this.debugService.exitDebug();
  }

  async sendCommand() {
    this.consoleInputEnabled = false;
    const result = await this.debugService.sendCommand(this.consoleInput);
    this.consoleInputEnabled = true;
    this.consoleInput = "";
    if (result.message !== "error") this.promptColor = "green";
    else this.promptColor = "red";
  }

  debugContinue() {
    this.debugService.debugContinue();
  }
  debugStepover() {
    this.debugService.debugStepover();
  }
  debugStepinto() {
    this.debugService.debugStepinto();
  }
  debugStepout() {
    this.debugService.debugStepout();
  }
  debugRestart() {
    this.debugService.debugRestart();
  }

  async evalExpr() {
    this.exprVal = await this.debugService.evalExpr(this.expr);
  }

  printPosition(data: FrameInfo | EditorBreakpointInfo) {
    if ("file" in data)
      return `${path.basename(data.file.replace(/\n/g, '\\'))}:${data.line}`;
    else
      return `${this.fileService.currentFileName()}:${data.line}`;
  }
  locate(frame: FrameInfo) {
    this.fileService.locate(frame.file, frame.line, 1);
  }
  locateLine(line: number) {
    this.debugService.locateEditorBreakpoint(line);
  }

  startEditBkpt(data: EditorBreakpointInfo) {
    if (this.debugService.isDebugging$.value) return;
    this.currentEditValue = data.expression;
    this.currentEditBkptline = data.line;
  }
  stopEditBkpt(data: EditorBreakpointInfo) {
    const newCondition = this.currentEditValue.trim() !== "" ? this.currentEditValue : null;
    const oldCondition = data.expression;
    
    // 只有在条件发生变化时才记录
    if (newCondition !== oldCondition) {
      this.debugService.changeBkptCondition(data.id, newCondition);
      
      // 记录断点条件修改
      this.debugService.recordBreakpointConditionChange(
        data.line,
        this.fileService.currentFileName(),
        newCondition
      );
    }
    
    this.currentEditBkptline = null;
  }
}
