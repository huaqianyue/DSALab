import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ChangeDetectorRef } from '@angular/core';

// 声明Howler类型（避免TypeScript错误）
declare global {
  interface Window {
    Howl: any;
    Howler: any;
  }
}

@Component({
  selector: 'app-howler-audio-player',
  templateUrl: './howler-audio-player.component.html',
  styleUrls: ['./howler-audio-player.component.scss']
})
export class HowlerAudioPlayerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() audioUrl: string | null = null;
  @Input() autoplay: boolean = false;
  @Output() durationLoaded = new EventEmitter<number>();
  @Output() playStateChange = new EventEmitter<boolean>();

  private sound: any = null;
  private howlerLoaded = false;

  // 播放器状态
  isPlaying = false;
  isPaused = false;
  duration = 0;
  currentTime = 0;
  isLoading = false;
  hasError = false;
  errorMessage = '';

  // 时间格式化
  get formattedDuration(): string {
    return this.formatTime(this.duration);
  }

  get formattedCurrentTime(): string {
    return this.formatTime(this.currentTime);
  }

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.loadHowler();
    if (this.audioUrl) {
      this.loadAudio();
    }
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private async loadHowler(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Howl) {
        this.howlerLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js';
      script.onload = () => {
        this.howlerLoaded = true;
        resolve();
      };
      script.onerror = () => {
        this.hasError = true;
        this.errorMessage = '无法加载Howler.js库';
        this.cdr.detectChanges();
        reject(new Error('Failed to load Howler.js'));
      };
      document.head.appendChild(script);
    });
  }

  private loadAudio(): void {
    if (!this.howlerLoaded || !this.audioUrl) {
      return;
    }

    this.cleanup();
    this.isLoading = true;
    this.hasError = false;
    this.cdr.detectChanges();

    try {
      this.sound = new window.Howl({
        src: [this.audioUrl],
        format: ['webm', 'mp3', 'wav'], // 支持多种格式
        preload: true,
        autoplay: this.autoplay,
        onload: () => {
          this.isLoading = false;
          this.duration = this.sound.duration();
          
          console.log('Howler.js - Audio loaded successfully, duration:', this.duration);
          
          if (this.duration && this.duration > 0) {
            this.durationLoaded.emit(this.duration);
          }
          
          this.cdr.detectChanges();
        },
        onplay: () => {
          this.isPlaying = true;
          this.isPaused = false;
          this.playStateChange.emit(true);
          this.startProgressTracking();
          this.cdr.detectChanges();
        },
        onpause: () => {
          this.isPlaying = false;
          this.isPaused = true;
          this.playStateChange.emit(false);
          this.cdr.detectChanges();
        },
        onstop: () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.currentTime = 0;
          this.playStateChange.emit(false);
          this.stopProgressTracking();
          this.cdr.detectChanges();
        },
        onend: () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.currentTime = 0;
          this.playStateChange.emit(false);
          this.stopProgressTracking();
          this.cdr.detectChanges();
        },
        onloaderror: (id: any, error: any) => {
          console.error('Howler.js - Audio load error:', error);
          this.isLoading = false;
          this.hasError = true;
          this.errorMessage = '音频加载失败';
          this.cdr.detectChanges();
        },
        onplayerror: (id: any, error: any) => {
          console.error('Howler.js - Audio play error:', error);
          this.hasError = true;
          this.errorMessage = '音频播放失败';
          this.cdr.detectChanges();
        }
      });
    } catch (error: any) {
      console.error('Howler.js - Error creating sound:', error);
      this.isLoading = false;
      this.hasError = true;
      this.errorMessage = '创建音频播放器失败';
      this.cdr.detectChanges();
    }
  }

  private progressInterval: any = null;

  private startProgressTracking(): void {
    this.stopProgressTracking(); // 确保没有重复的定时器
    
    // 使用requestAnimationFrame获得最平滑的动画
    const updateProgress = () => {
      if (this.sound && this.isPlaying) {
        // 获取精确的当前播放时间
        const newTime = this.sound.seek() || 0;
        
        // 只有时间真正变化时才更新UI，避免不必要的渲染
        if (Math.abs(newTime - this.currentTime) > 0.01) { // 0.01秒的精度
          this.currentTime = newTime;
          // 强制更新，确保滑块位置立即同步
          this.cdr.detectChanges();
        }
        
        // 继续下一帧
        this.progressInterval = requestAnimationFrame(updateProgress);
      }
    };
    
    // 开始动画循环
    this.progressInterval = requestAnimationFrame(updateProgress);
  }

  private stopProgressTracking(): void {
    if (this.progressInterval) {
      cancelAnimationFrame(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private updateProgress(): void {
    // 保留这个方法以防其他地方调用，但主要使用 startProgressTracking
    if (!this.sound || !this.isPlaying) {
      return;
    }
    this.currentTime = this.sound.seek() || 0;
    this.cdr.markForCheck();
  }

  private cleanup(): void {
    this.stopProgressTracking(); // 清理定时器
    if (this.sound) {
      this.sound.unload();
      this.sound = null;
    }
  }

  private formatTime(seconds: number): string {
    if (!seconds || seconds === Infinity) {
      return '0:00';
    }
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // 公共方法
  play(): void {
    if (!this.sound) return;
    
    if (this.isPaused) {
      this.sound.play();
    } else {
      this.sound.play();
    }
  }

  pause(): void {
    if (!this.sound) return;
    this.sound.pause();
  }

  stop(): void {
    if (!this.sound) return;
    this.sound.stop();
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(position: number): void {
    if (!this.sound) return;
    this.sound.seek(position);
    this.currentTime = position;
  }

  setVolume(volume: number): void {
    if (!this.sound) return;
    this.sound.volume(Math.max(0, Math.min(1, volume)));
  }

  // 当音频URL改变时重新加载
  ngOnChanges(): void {
    if (this.howlerLoaded && this.audioUrl) {
      this.loadAudio();
    }
  }
}
