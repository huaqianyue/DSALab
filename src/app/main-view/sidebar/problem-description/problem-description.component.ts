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

import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
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
export class ProblemDescriptionComponent implements OnInit, OnDestroy, AfterViewInit {
  currentProblem: Problem | null = null;
  problems: Problem[] = [];
  workspaceData: ProblemWorkspaceData | null = null;
  
  // 音频录制和播放状态
  private mediaRecorder: any | null = null;
  private audioChunks: Blob[] = [];
  audioBlobUrl: string | null = null; // 公开给模板使用
  isRecording: boolean = false; // 公开给模板使用
  isPaused: boolean = false; // 公开给模板使用
  private recordingStartTime: number | null = null;
  private pausedTime: number = 0;
  private lastResumeTime: number | null = null;
  
  // Howler播放器状态
  private audioIsPlaying = false;
  private audioDuration = 0;
  
  // 录制时间显示
  recordingTime = 0; // 公开给模板使用
  private recordingInterval: any = null;
  
  // 音频格式配置
  private readonly AUDIO_FORMAT = 'audio/webm'; // 可以改为 'audio/wav' 尝试其他格式
  private readonly AUDIO_FILE_EXT = '.webm'; // 对应的文件扩展名
  
  private destroy$ = new Subject<void>();

  constructor(
    private dsalabService: DSALabProblemService,
    private tabsService: TabsService,
    private electronService: ElectronService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // 订阅当前问题变化
    this.dsalabService.currentProblem$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problem => {
        this.currentProblem = problem;
        setTimeout(() => {
          this.updateWorkspaceData();
        }, 0);
      });

    // 订阅问题列表变化
    this.dsalabService.problems$
      .pipe(takeUntil(this.destroy$))
      .subscribe(problems => {
        this.problems = problems;
      });
  }

  ngAfterViewInit(): void {
    // 不再需要初始化DOM元素，Howler.js组件会处理
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // 重要：不要在组件销毁时清理音频URL！
    // 因为路由切换会销毁组件，但我们希望保持音频状态
    // URL的清理由DSALab服务管理
    console.log('🗑️ ProblemDescriptionComponent destroyed, keeping audio state');
    
    // 清理录制定时器
    this.stopRecordingTimer();
  }

  // 简化的音频录制方法 - 适配Howler.js播放器

  private updateWorkspaceData(): void {
    console.log('🔄 Updating workspace data for current problem');
    
    const newWorkspaceData = this.dsalabService.getCurrentProblemWorkspaceData();
    const isNewProblem = !this.workspaceData || 
                        (this.currentProblem && this.workspaceData !== newWorkspaceData);
    
    if (isNewProblem) {
      console.log('📝 New problem detected, resetting recording state');
      // 只有在切换到新题目时才清理录制状态
      this.stopRecordingTimer();
      this.isRecording = false;
      this.isPaused = false;
      this.recordingTime = 0;
    } else {
      console.log('📌 Same problem, keeping recording state');
    }
    
    this.workspaceData = newWorkspaceData;
    
    if (this.workspaceData?.audioUrl && this.workspaceData?.audioBlob) {
      console.log('🎵 Found audio data in workspace, updating audio state');
      this.updateAudioState(this.workspaceData.audioBlob, this.workspaceData.audioUrl);
    } else {
      console.log('🎵 No audio data in workspace, clearing audio state');
      this.updateAudioState(null, null);
    }
  }



  // DSALab原始音频录制方法
  public async toggleRecordAudio(): Promise<void> {
    if (!this.isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new (window as any).MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: this.AUDIO_FORMAT });
          if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
          }
          this.audioBlobUrl = URL.createObjectURL(audioBlob);
          
          console.log('🎵 Recording stopped - Blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);
          console.log('🎵 Created blob URL for Howler.js:', this.audioBlobUrl);

          // 通知服务更新音频数据
          this.dsalabService.updateCurrentProblemAudio(audioBlob, this.audioBlobUrl);

          // 计算实际录制时间（总时间减去暂停时间）
          const totalDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
          const actualDuration = totalDuration - this.pausedTime;
          
          // 记录历史事件
          this.dsalabService.recordAudioEvent(
            this.currentProblem!.id,
            'audio_record_stop',
            actualDuration,
            Math.round(audioBlob.size / 1024)
          );
          
          this.recordingStartTime = null;
          this.pausedTime = 0;
          this.lastResumeTime = null;

          // 重置录制状态
          this.isRecording = false;
          this.isPaused = false;
          this.stopRecordingTimer(); // 停止时间跟踪
          this.cdr.detectChanges();
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.isPaused = false;
        this.recordingStartTime = Date.now();
        this.pausedTime = 0;
        this.lastResumeTime = Date.now();
        
        // 开始录制时间跟踪
        this.startRecordingTimer();
        
        console.log('🎵 Recording started');
        
        // 记录开始录音事件
        this.dsalabService.recordAudioEvent(
          this.currentProblem!.id,
          'audio_record_start'
        );

        this.cdr.detectChanges();
      } catch (err) {
        console.error('无法访问麦克风', err);
      }
    } else {
      // 停止录制
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
    }
  }

  public togglePauseResumeRecording(): void {
    if (!this.isRecording) return;

    if (!this.isPaused) {
      // 暂停录制
      this.mediaRecorder?.pause();
      this.isPaused = true;
      
      // 计算本次暂停前的录制时间并累加到总暂停时间
      if (this.lastResumeTime) {
        this.pausedTime += Date.now() - this.lastResumeTime;
        this.lastResumeTime = null;
      }
      
      console.log('🎵 Recording paused');
      
      this.dsalabService.recordAudioEvent(
        this.currentProblem!.id,
        'audio_record_pause'
      );
    } else {
      // 继续录制
      this.mediaRecorder?.resume();
      this.isPaused = false;
      this.lastResumeTime = Date.now();
      
      console.log('🎵 Recording resumed');
      
      this.dsalabService.recordAudioEvent(
        this.currentProblem!.id,
        'audio_record_resume'
      );
    }

    this.cdr.detectChanges();
  }

  public updateAudioState(audioBlob: Blob | null, audioUrl: string | null): void {
    console.log('🔄 updateAudioState called - current URL:', this.audioBlobUrl, 'new URL:', audioUrl);
    
    // 只有在URL真正不同时才清理旧的URL
    if (this.audioBlobUrl && this.audioBlobUrl !== audioUrl) {
      URL.revokeObjectURL(this.audioBlobUrl);
      console.log('🧹 Revoked old audio URL:', this.audioBlobUrl);
    }
    
    this.audioBlobUrl = audioUrl;
    
    if (audioBlob && audioUrl) {
      console.log('🎵 Setting audio state - Blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);
      console.log('🎵 Audio URL for Howler.js:', audioUrl);
      
      // 检查Blob是否有效
      if (audioBlob.size === 0) {
        console.warn('Audio blob is empty!');
        this.audioBlobUrl = null;
        return;
      }
      
      console.log('🎵 Audio ready for Howler.js player');
    } else {
      console.log('🎵 No audio available');
    }

    // 重置录制状态（只在真正切换题目时）
    this.isRecording = false;
    this.isPaused = false;
    
    // 触发变更检测，确保模板更新
    this.cdr.detectChanges();
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


  // 切换问题并更新标签页
  private async switchToProblemAndUpdateTab(problem: Problem): Promise<void> {
    try {
      // 先关闭当前DSALab标签页（如果存在）
      const currentTab = this.tabsService.getActive();
      if (currentTab.value && currentTab.value.key.startsWith('dsalab-')) {
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
        
        console.log(`Navigated to problem ${problem.id}, loaded code length: ${workspaceData.content.length}`);
      }

    } catch (error) {
      console.error('Failed to switch problem:', error);
      // 这里可以添加错误提示
    }
  }

  // === 录制时间管理 ===

  private startRecordingTimer(): void {
    this.stopRecordingTimer(); // 确保没有重复的定时器
    this.recordingTime = 0;
    
    this.recordingInterval = setInterval(() => {
      if (this.isRecording && !this.isPaused) {
        this.recordingTime += 0.1; // 每100ms增加0.1秒
        this.cdr.markForCheck();
      }
    }, 100); // 100ms更新一次，显示更精确
  }

  private stopRecordingTimer(): void {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
  }

  private resetRecordingTimer(): void {
    this.recordingTime = 0;
    this.stopRecordingTimer();
  }

  // 格式化录制时间显示
  getFormattedRecordingTime(): string {
    if (!this.isRecording && this.recordingTime === 0) {
      return '00:00';
    }
    
    const minutes = Math.floor(this.recordingTime / 60);
    const seconds = Math.floor(this.recordingTime % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // === 新增：模板方法和Howler播放器集成 ===

  // 模板方法：获取录制按钮文本
  getRecordButtonText(): string {
    if (this.isRecording) {
      return '停止';
    }
    return this.audioBlobUrl ? '重录' : '录制';
  }

  // 模板方法：获取录制按钮图标
  getRecordButtonIcon(): string {
    if (this.isRecording) {
      return 'fas fa-stop';
    }
    return 'fas fa-microphone';
  }

  // 模板方法：获取录制按钮提示
  getRecordButtonTooltip(): string {
    if (this.isRecording) {
      return '停止录制';
    }
    return this.audioBlobUrl ? '重新录制' : '开始录制';
  }

  // Howler播放器事件处理
  onAudioDurationLoaded(duration: number): void {
    this.audioDuration = duration;
    console.log('🎵 Howler.js - Duration loaded:', duration, 'seconds');
    console.log('🎵 Duration display should now work correctly!');
  }

  onAudioPlayStateChange(isPlaying: boolean): void {
    this.audioIsPlaying = isPlaying;
    console.log('🎵 Howler.js - Play state changed:', isPlaying);
    
    // 记录音频播放历史（只在开始播放时记录）
    if (isPlaying && this.currentProblem) {
      this.dsalabService.recordAudioEvent(
        this.currentProblem.id,
        'audio_play',
        Math.round(this.audioDuration * 1000)
      );
    }
  }

}