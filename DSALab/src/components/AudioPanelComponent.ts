// src/components/AudioPanelComponent.ts

import { Translations } from '../types';

interface AudioPanelEvents {
  onAudioModified: (blob: Blob | null, url: string | null) => void;
  onRecordStart: () => void;
  onRecordPause: () => void;
  onRecordResume: () => void;
  onRecordStop: (durationMs: number, audioSizeKB: number) => void;
  onAppendOutput: (type: string, text: string) => void;
}

export class AudioPanelComponent {
  private recordBtn: HTMLButtonElement;
  private pauseResumeBtn: HTMLButtonElement;
  private audioPlayback: HTMLAudioElement;
  private panelElement: HTMLElement; // Reference to the audio panel itself

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioBlobUrl: string | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false; // 新增：暂停状态
  private recordingStartTime: number | null = null;
  private pausedTime: number = 0; // 新增：累计暂停时间
  private lastResumeTime: number | null = null; // 新增：最后一次恢复录制的时间

  private events: AudioPanelEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;

  constructor(panelElement: HTMLElement, events: AudioPanelEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.panelElement = panelElement;
    this.recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;
    this.pauseResumeBtn = document.getElementById('pauseResumeBtn') as HTMLButtonElement;
    this.audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;

    if (!this.recordBtn || !this.pauseResumeBtn || !this.audioPlayback) {
      console.error('Audio panel buttons or audio element not found!');
      throw new Error('Audio panel elements missing.');
    }

    this.events = events;
    this.t = t;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.recordBtn.addEventListener('click', () => this.toggleRecordAudio());
    this.pauseResumeBtn.addEventListener('click', () => this.togglePauseResumeRecording());
  }

  public async toggleRecordAudio(): Promise<void> {
    if (!this.isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
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

          this.events.onAudioModified(audioBlob, this.audioBlobUrl); // Notify App of modification

          // 计算实际录制时间（总时间减去暂停时间）
          const totalDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
          const actualDuration = totalDuration - this.pausedTime;
          this.events.onRecordStop(actualDuration, Math.round(audioBlob.size / 1024));
          
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
        this.events.onAppendOutput('info', this.t('recordingStarted'));
        this.events.onRecordStart();
      } catch (err) {
        console.error(this.t('microphoneAccessFailed'), err);
        this.events.onAppendOutput('error', `${this.t('microphoneAccessFailed')}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      this.isRecording = false;
      this.isPaused = false;
      this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`;
      this.recordBtn.classList.remove('recording');
      this.pauseResumeBtn.disabled = true;
      this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
      this.events.onAppendOutput('info', this.t('recordingStopped'));
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
      this.events.onAppendOutput('info', '录制已暂停');
      this.events.onRecordPause();
    } else {
      // 继续录制
      this.mediaRecorder?.resume();
      this.isPaused = false;
      this.lastResumeTime = Date.now();
      
      this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
      this.events.onAppendOutput('info', '录制已继续');
      this.events.onRecordResume();
    }
  }



  public updateAudioState(audioBlob: Blob | null, audioUrl: string | null): void {
    this.audioBlobUrl = audioUrl;
    if (audioBlob && audioUrl) {
      this.audioPlayback.src = audioUrl;
      this.pauseResumeBtn.disabled = true;
      this.audioPlayback.style.display = 'block';
    } else {
      this.audioPlayback.src = '';
      this.pauseResumeBtn.disabled = true;
      this.audioPlayback.style.display = 'none';
    }

    this.isRecording = false;
    this.isPaused = false;
    this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`;
    this.recordBtn.classList.remove('recording');
    this.pauseResumeBtn.innerHTML = `<i class="fas fa-pause"></i> 暂停`;
  }

  public toggleVisibility(show: boolean): void {
    if (show) {
      this.panelElement.classList.remove('hidden');
    } else {
      this.panelElement.classList.add('hidden');
    }
  }
}