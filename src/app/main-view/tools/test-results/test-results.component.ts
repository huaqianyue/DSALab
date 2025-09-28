import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-test-results',
  templateUrl: './test-results.component.html',
  styleUrls: ['./test-results.component.scss']
})
export class TestResultsComponent implements OnInit {
  testResult: any = null;

  constructor() { }

  ngOnInit(): void {
    // 获取测试结果
    this.testResult = (window as any).lastTestResult;
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
