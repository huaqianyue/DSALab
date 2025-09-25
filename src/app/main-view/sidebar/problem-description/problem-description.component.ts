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
import { DSALabProblemService } from '../../../services/dsalab-problem.service';
import { TabsService } from '../../../services/tabs.service';
import { ElectronService } from '../../../core/services';
import { Problem, ProblemWorkspaceData } from '../../../services/dsalab-types';

@Component({
  selector: 'app-problem-description',
  templateUrl: './problem-description.component.html',
  styleUrls: ['./problem-description.component.scss']
})
export class ProblemDescriptionComponent implements OnInit, OnDestroy {
  currentProblem: Problem | null = null;
  problems: Problem[] = [];
  workspaceData: ProblemWorkspaceData | null = null;
  
  // 音频相关状态
  isRecording = false;
  isPaused = false;
  audioUrl: string | null = null;
  recordingDuration = 0; // 当前录制时长（秒）
  audioDuration = 0; // 音频总时长（秒）
  
  private destroy$ = new Subject<void>();
  private mediaRecorder: any | null = null;
  private audioChunks: Blob[] = [];
  private recordingStartTime: number | null = null;
  private pausedTime = 0;
  private lastResumeTime: number | null = null;
  private recordingTimer: any = null;

  constructor(
    private dsalabService: DSALabProblemService,
    private tabsService: TabsService,
    private electronService: ElectronService
  ) { }

  ngOnInit(): void {
    // 订阅当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        this.currentProblem = problem;
        this.updateWorkspaceData();
      });

    // 订阅问题列表变化
    this.dsalabService.problems$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problems => {
        this.problems = problems;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // 清理音频资源
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
    }
  }

  private updateWorkspaceData(): void {
    this.workspaceData = this.dsalabService.getCurrentProblemWorkspaceData();
    if (this.workspaceData?.audioUrl) {
      this.audioUrl = this.workspaceData.audioUrl;
      
      // 获取音频时长
      const audio = new Audio(this.audioUrl);
      audio.addEventListener('loadedmetadata', () => {
        this.audioDuration = Math.floor(audio.duration);
      });
    } else {
      this.audioUrl = null;
      this.audioDuration = 0;
    }
  }

  // 导航到上一题
  async navigateToPrevious(): Promise<void> {
    if (!this.currentProblem) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblem!.id);
    if (currentIndex > 0) {
      const previousProblem = this.problems[currentIndex - 1];
      await this.switchToProblemAndUpdateTab(previousProblem);
    }
  }

  // 导航到下一题
  async navigateToNext(): Promise<void> {
    if (!this.currentProblem) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblem!.id);
    if (currentIndex < this.problems.length - 1) {
      const nextProblem = this.problems[currentIndex + 1];
      await this.switchToProblemAndUpdateTab(nextProblem);
    }
  }

  // 检查是否可以导航到上一题
  canNavigateToPrevious(): boolean {
    if (!this.currentProblem) return false;
    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblem!.id);
    return currentIndex > 0;
  }

  // 检查是否可以导航到下一题
  canNavigateToNext(): boolean {
    if (!this.currentProblem) return false;
    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblem!.id);
    return currentIndex < this.problems.length - 1;
  }

  // 开始/停止录音
  async toggleRecording(): Promise<void> {
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      this.stopRecording();
    }
  }

  // 暂停/恢复录音
  togglePause(): void {
    if (!this.mediaRecorder || !this.isRecording) return;

    if (this.isPaused) {
      this.resumeRecording();
    } else {
      this.pauseRecording();
    }
  }

  private async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new (window as any).MediaRecorder(stream);
      this.audioChunks = [];
      this.recordingStartTime = Date.now();
      this.pausedTime = 0;
      this.lastResumeTime = Date.now();
      this.recordingDuration = 0;

      // 开始录音计时器
      this.recordingTimer = setInterval(() => {
        if (this.isRecording && !this.isPaused && this.recordingStartTime && this.lastResumeTime) {
          const currentTime = Date.now();
          const totalTime = currentTime - this.recordingStartTime;
          const actualTime = totalTime - this.pausedTime;
          this.recordingDuration = Math.floor(actualTime / 1000);
        }
      }, 100);

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        // 停止计时器
        if (this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // 清理旧的音频URL
        if (this.audioUrl) {
          URL.revokeObjectURL(this.audioUrl);
        }
        
        this.audioUrl = URL.createObjectURL(audioBlob);
        
        // 获取音频时长
        const audio = new Audio(this.audioUrl);
        audio.addEventListener('loadedmetadata', () => {
          this.audioDuration = Math.floor(audio.duration);
        });
        
        // 更新工作区数据
        this.dsalabService.updateCurrentProblemAudio(audioBlob, this.audioUrl);
        
        // 计算录音时长
        const totalDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
        const actualDuration = totalDuration - this.pausedTime;
        
        // 记录历史事件
        this.dsalabService.recordHistoryEvent({
          timestamp: Date.now(),
          problemId: this.currentProblem!.id,
          eventType: 'audio_record_stop',
          durationMs: actualDuration,
          audioSizeKB: Math.round(audioBlob.size / 1024),
        });

        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.isPaused = false;

      // 记录开始录音事件
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_record_start',
      });

    } catch (error) {
      console.error('Failed to start recording:', error);
      // 这里可以添加错误提示
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.isPaused = false;
    }
  }

  private pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      
      // 计算本次暂停前的录制时间并累加到总暂停时间
      if (this.lastResumeTime) {
        this.pausedTime += Date.now() - this.lastResumeTime;
        this.lastResumeTime = null;
      }
      
      // 记录暂停事件
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_record_pause',
      });
    }
  }

  private resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.lastResumeTime = Date.now();
      
      // 记录恢复事件
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_record_resume',
      });
    }
  }

  // 播放音频
  playAudio(): void {
    if (this.audioUrl) {
      const audio = new Audio(this.audioUrl);
      audio.play().catch(error => {
        console.error('Failed to play audio:', error);
      });

      // 记录播放事件
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_play',
      });
    }
  }

  // 检查是否有音频
  hasAudio(): boolean {
    return !!this.audioUrl;
  }

  // 获取录音按钮文本
  getRecordButtonText(): string {
    if (this.isRecording) {
      return this.isPaused ? '继续录音' : '停止录音';
    }
    return this.hasAudio() ? '重新录音' : '开始录音';
  }

  // 获取录音按钮图标
  getRecordButtonIcon(): string {
    if (this.isRecording) {
      return this.isPaused ? 'play-circle' : 'stop';
    }
    return 'audio';
  }

  // 格式化时长（秒 -> MM:SS）
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // 获取当前录音时长显示文本
  getCurrentDurationText(): string {
    if (this.isRecording) {
      return `录制中: ${this.formatDuration(this.recordingDuration)}`;
    }
    return '';
  }

  // 获取音频时长显示文本
  getAudioDurationText(): string {
    if (this.hasAudio() && this.audioDuration > 0) {
      return `时长: ${this.formatDuration(this.audioDuration)}`;
    }
    return '';
  }

  // 切换问题并更新标签页
  private async switchToProblemAndUpdateTab(problem: Problem): Promise<void> {
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
        
        console.log(`Navigated to problem ${problem.id}, loaded code length: ${workspaceData.content.length}`);
      }

    } catch (error) {
      console.error('Failed to switch problem:', error);
      // 这里可以添加错误提示
    }
  }
}