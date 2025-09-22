// src/components/SettingsComponent.ts

import { AppSettings } from '../types';

interface SettingsEvents {
  onSettingsChange: (settings: AppSettings) => Promise<void>;
}

export class SettingsComponent {
  private userNameInput: HTMLInputElement;
  private studentIdInput: HTMLInputElement;
  private events: SettingsEvents;
  private currentSettings: AppSettings;

  constructor(events: SettingsEvents) {
    this.userNameInput = document.getElementById('userNameInput') as HTMLInputElement;
    this.studentIdInput = document.getElementById('studentIdInput') as HTMLInputElement;

    if (!this.userNameInput || !this.studentIdInput) {
      console.error('Settings input fields not found!');
      throw new Error('Settings elements missing.');
    }

    this.events = events;
    this.currentSettings = { userName: '', studentId: '', lastOpenedProblemId: null }; // Default, will be updated by App
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.userNameInput.addEventListener('input', () => this.handleInputChange());
    this.studentIdInput.addEventListener('input', () => this.handleInputChange());
  }

  private handleInputChange(): void {
    this.currentSettings.userName = this.userNameInput.value;
    this.currentSettings.studentId = this.studentIdInput.value;
    this.events.onSettingsChange(this.currentSettings);
  }

  public updateSettings(settings: AppSettings): void {
    this.currentSettings = { ...settings }; // Ensure we're working with a copy
    this.userNameInput.value = settings.userName;
    this.studentIdInput.value = settings.studentId;
  }
}