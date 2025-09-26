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
  
  // DSALab音频组件状态
  private recordBtn!: HTMLButtonElement;
  private pauseResumeBtn!: HTMLButtonElement;
  private audioPlayback!: HTMLAudioElement;
  
  private mediaRecorder: any | null = null;
  private audioChunks: Blob[] = [];
  private audioBlobUrl: string | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private recordingStartTime: number | null = null;
  private pausedTime: number = 0;
  private lastResumeTime: number | null = null;
  
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
    // 初始化DSALab音频组件
    this.initializeAudioComponents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // 清理音频资源
    if (this.audioBlobUrl) {
      URL.revokeObjectURL(this.audioBlobUrl);
    }
  }

  // 初始化音频组件 - 完全按照DSALab原始实现
  private initializeAudioComponents(): void {
    this.recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;
    this.pauseResumeBtn = document.getElementById('pauseResumeBtn') as HTMLButtonElement;
    this.audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;

    if (!this.recordBtn || !this.pauseResumeBtn || !this.audioPlayback) {
      console.error('Audio panel buttons or audio element not found!');
      return;
    }

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.recordBtn.addEventListener('click', () => this.toggleRecordAudio());
    this.pauseResumeBtn.addEventListener('click', () => this.togglePauseResumeRecording());
    
    // 简化的音频元数据监听器
    this.audioPlayback.addEventListener('loadedmetadata', () => {
      console.log('Audio metadata loaded, duration:', this.audioPlayback.duration);
      console.log('User Agent:', navigator.userAgent);
      console.log('Chrome version:', this.getChromeVersion());
    });
    
    this.audioPlayback.addEventListener('canplay', () => {
      console.log('Audio can play, duration:', this.audioPlayback.duration);
    });

    this.audioPlayback.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      console.error('Audio error details:', this.audioPlayback.error);
    });
  }

  private updateWorkspaceData(): void {
    this.workspaceData = this.dsalabService.getCurrentProblemWorkspaceData();
    if (this.workspaceData?.audioUrl && this.workspaceData?.audioBlob) {
      this.updateAudioState(this.workspaceData.audioBlob, this.workspaceData.audioUrl);
    } else {
      this.updateAudioState(null, null);
    }
  }

  // 获取Chrome版本信息
  private getChromeVersion(): string {
    const userAgent = navigator.userAgent;
    const chromeMatch = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    return chromeMatch ? chromeMatch[1] : 'Unknown';
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
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
          }
          this.audioBlobUrl = URL.createObjectURL(audioBlob);
          this.audioPlayback.src = this.audioBlobUrl;
          this.pauseResumeBtn.disabled = true;
          this.audioPlayback.style.display = 'block';
          
          console.log('Recording stopped - Blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);
          
          // 完全按照DSALab原始实现，不做额外处理

          // 通知服务更新音频数据
          this.dsalabService.updateCurrentProblemAudio(audioBlob, this.audioBlobUrl);

          // 计算实际录制时间（总时间减去暂停时间）
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
          
          this.recordingStartTime = null;
          this.pausedTime = 0;
          this.lastResumeTime = null;
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.isPaused = false;
        this.recordingStartTime = Date.now();
        this.pausedTime = 0;
        this.lastResumeTime = Date.now();
        
        this.recordBtn.innerHTML = `<i class="fas fa-stop"></i> 停止`;
        this.recordBtn.classList.add('recording');
        this.pauseResumeBtn.disabled = false;
        this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
        this.audioPlayback.style.display = 'none';
        this.audioPlayback.src = '';
        
        // 记录开始录音事件
        this.dsalabService.recordHistoryEvent({
          timestamp: Date.now(),
          problemId: this.currentProblem!.id,
          eventType: 'audio_record_start',
        });
      } catch (err) {
        console.error('无法访问麦克风', err);
      }
    } else {
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      this.isRecording = false;
      this.isPaused = false;
      this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> 录制`;
      this.recordBtn.classList.remove('recording');
      this.pauseResumeBtn.disabled = true;
      this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
    }
  }

  private togglePauseResumeRecording(): void {
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
      
      this.pauseResumeBtn.innerHTML = `<i class="fas fa-play"></i> 继续`;
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_record_pause',
      });
    } else {
      // 继续录制
      this.mediaRecorder?.resume();
      this.isPaused = false;
      this.lastResumeTime = Date.now();
      
      this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
      this.dsalabService.recordHistoryEvent({
        timestamp: Date.now(),
        problemId: this.currentProblem!.id,
        eventType: 'audio_record_resume',
      });
    }
  }

  public updateAudioState(audioBlob: Blob | null, audioUrl: string | null): void {
    this.audioBlobUrl = audioUrl;
    if (audioBlob && audioUrl) {
      console.log('Setting audio state - Blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);
      console.log('Audio URL:', audioUrl);
      
      this.audioPlayback.src = audioUrl;
      this.pauseResumeBtn.disabled = true;
      this.audioPlayback.style.display = 'block';
      
      // 检查Blob是否有效
      if (audioBlob.size === 0) {
        console.warn('Audio blob is empty!');
        return;
      }
      
      // 完全按照DSALab原始实现，不做额外处理
    } else {
      this.audioPlayback.src = '';
      this.pauseResumeBtn.disabled = true;
      this.audioPlayback.style.display = 'none';
    }

    this.isRecording = false;
    this.isPaused = false;
    this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> 录制`;
    this.recordBtn.classList.remove('recording');
    this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
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

}