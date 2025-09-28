import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DSALabProblemService } from '../../../services/dsalab-problem.service';
import { ElectronService } from '../../../core/services';

@Component({
  selector: 'app-test-results',
  templateUrl: './test-results.component.html',
  styleUrls: ['./test-results.component.scss']
})
export class TestResultsComponent implements OnInit, OnDestroy {
  testResult: any = null;
  currentProblemId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private dsalabService: DSALabProblemService,
    private electronService: ElectronService
  ) { }

  ngOnInit(): void {
    // 监听当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        if (problem) {
          this.currentProblemId = problem.id;
          this.loadTestResultForProblem(problem.id);
        } else {
          this.currentProblemId = null;
          this.testResult = null;
        }
      });

    // 监听测试结果更新事件
    window.addEventListener('testResultUpdated', this.handleTestResultUpdated);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // 移除事件监听器
    window.removeEventListener('testResultUpdated', this.handleTestResultUpdated);
  }

  private handleTestResultUpdated = (event: any) => {
    const { problemId, result } = event.detail;
    if (this.currentProblemId === problemId) {
      this.testResult = result;
    }
  }

  private async loadTestResultForProblem(problemId: string): Promise<void> {
    try {
      const testResult = await this.electronService.ipcRenderer.invoke('dsalab-read-test-result' as any, problemId);
      this.testResult = testResult;
    } catch (error) {
      console.error('Failed to load test result:', error);
      this.testResult = null;
    }
  }

  getStatusIcon(passed: boolean): string {
    return passed ? 'check-circle' : 'close-circle';
  }

  getStatusColor(passed: boolean): string {
    return passed ? '#52c41a' : '#ff4d4f';
  }

  getOverallStatus(): { text: string; color: string; icon: string } {
    if (!this.testResult) {
      return { text: '无测试结果', color: '#d9d9d9', icon: 'question-circle' };
    }

    if (!this.testResult.success) {
      return { text: '测试失败', color: '#ff4d4f', icon: 'close-circle' };
    }

    if (this.testResult.passed) {
      return { text: '全部通过', color: '#52c41a', icon: 'check-circle' };
    } else {
      return { text: '部分通过', color: '#fa8c16', icon: 'exclamation-circle' };
    }
  }

  formatTestOutput(output: string): string {
    if (!output) return '';
    
    // 格式化测试输出，突出显示测试结果
    return output
      .replace(/\[TEST\]/g, '<span style="color: #1890ff; font-weight: bold;">[TEST]</span>')
      .replace(/\[PASS\]/g, '<span style="color: #52c41a; font-weight: bold;">[PASS]</span>')
      .replace(/\[FAIL\]/g, '<span style="color: #ff4d4f; font-weight: bold;">[FAIL]</span>')
      .replace(/\[RESULT\]/g, '<span style="color: #722ed1; font-weight: bold;">[RESULT]</span>')
      .replace(/\[SCORE\]/g, '<span style="color: #eb2f96; font-weight: bold;">[SCORE]</span>');
  }
}
