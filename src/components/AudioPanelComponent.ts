// src/components/AudioPanelComponent.ts

import { Translations } from '../types';

interface AudioPanelEvents {
  onAudioModified: (blob: Blob | null, url: string | null) => void;
  onRecordStart: () => void;
  onRecordStop: (durationMs: number, audioSizeKB: number) => void;
  onAudioPlay: (durationMs: number) => void;
  onAppendOutput: (type: string, text: string) => void;
}

export class AudioPanelComponent {
  private recordBtn: HTMLButtonElement;
  private playBtn: HTMLButtonElement;
  private audioPlayback: HTMLAudioElement;
  private panelElement: HTMLElement; // Reference to the audio panel itself

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioBlobUrl: string | null = null;
  private isRecording: boolean = false;
  private recordingStartTime: number | null = null;

  private events: AudioPanelEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;

  constructor(panelElement: HTMLElement, events: AudioPanelEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.panelElement = panelElement;
    this.recordBtn = document.getElementById('recordAudioBtn') as HTMLButtonElement;
    this.playBtn = document.getElementById('playAudioBtn') as HTMLButtonElement;
    this.audioPlayback = document.getElementById('audioPlayback') as HTMLAudioElement;

    if (!this.recordBtn || !this.playBtn || !this.audioPlayback) {
      console.error('Audio panel buttons or audio element not found!');
      throw new Error('Audio panel elements missing.');
    }

    this.events = events;
    this.t = t;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.recordBtn.addEventListener('click', () => this.toggleRecordAudio());
    this.playBtn.addEventListener('click', () => this.playAudio());
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
          this.playBtn.disabled = false;
          this.audioPlayback.style.display = 'block';

          this.events.onAudioModified(audioBlob, this.audioBlobUrl); // Notify App of modification

          const durationMs = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
          this.events.onRecordStop(durationMs, Math.round(audioBlob.size / 1024));
          this.recordingStartTime = null;
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.recordBtn.innerHTML = `<i class="fas fa-stop"></i> ${this.t('recordAudio')}`;
        this.recordBtn.classList.add('recording');
        this.playBtn.disabled = true;
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
      this.recordingStartTime = null;
      this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`;
      this.recordBtn.classList.remove('recording');
      this.events.onAppendOutput('info', this.t('recordingStopped'));
    }
  }

  public playAudio(): void {
    if (this.audioPlayback && this.audioPlayback.src) {
      this.audioPlayback.play().then(() => {
        this.events.onAudioPlay(this.audioPlayback.duration * 1000);
      }).catch(e => {
        console.error(this.t('playbackFailed'), e);
        this.events.onAppendOutput('error', `${this.t('playbackFailed')}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  }

  public updateAudioState(audioBlob: Blob | null, audioUrl: string | null): void {
    this.audioBlobUrl = audioUrl;
    if (audioBlob && audioUrl) {
      this.audioPlayback.src = audioUrl;
      this.playBtn.disabled = false;
      this.audioPlayback.style.display = 'block';
    } else {
      this.audioPlayback.src = '';
      this.playBtn.disabled = true;
      this.audioPlayback.style.display = 'none';
    }

    this.isRecording = false;
    this.recordBtn.innerHTML = `<i class="fas fa-microphone"></i> ${this.t('recordAudio')}`;
    this.recordBtn.classList.remove('recording');
  }

  public toggleVisibility(show: boolean): void {
    if (show) {
      this.panelElement.classList.remove('hidden');
    } else {
      this.panelElement.classList.add('hidden');
    }
  }
}