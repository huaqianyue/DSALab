// src/components/ToolbarComponent.ts

import { Translations } from '../types';

interface ToolbarEvents {
  onRun: () => Promise<void>;
  onClearOutput: () => void;
  onSave: () => Promise<void>;
  onExport: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onImport: () => Promise<void>;
}

export class ToolbarComponent {
  private runBtn: HTMLButtonElement;
  private clearOutputBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;
  private importBtn: HTMLButtonElement;

  private events: ToolbarEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;

  constructor(events: ToolbarEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.runBtn = document.getElementById('runBtn') as HTMLButtonElement;
    this.clearOutputBtn = document.getElementById('clearOutputBtn') as HTMLButtonElement;
    this.saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    this.exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
    this.refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
    this.importBtn = document.getElementById('importBtn') as HTMLButtonElement;

    if (!this.runBtn || !this.clearOutputBtn || !this.saveBtn || !this.exportBtn || !this.refreshBtn || !this.importBtn) {
      console.error('One or more toolbar buttons not found!');
      throw new Error('Toolbar elements missing.');
    }

    this.events = events;
    this.t = t;
    this.setupEventListeners();
    this.updateTooltips();
  }

  private setupEventListeners(): void {
    this.runBtn.addEventListener('click', () => this.events.onRun());
    this.clearOutputBtn.addEventListener('click', () => this.events.onClearOutput());
    this.saveBtn.addEventListener('click', () => this.events.onSave());
    this.exportBtn.addEventListener('click', () => this.events.onExport());
    this.refreshBtn.addEventListener('click', () => this.events.onRefresh());
    this.importBtn.addEventListener('click', () => this.events.onImport());
  }

  private updateTooltips(): void {
    this.runBtn.setAttribute('data-tooltip', this.t('runTooltip'));
    this.clearOutputBtn.setAttribute('data-tooltip', this.t('clearTooltip'));
    this.saveBtn.setAttribute('data-tooltip', this.t('saveTooltip'));
    this.exportBtn.setAttribute('data-tooltip', this.t('exportTooltip'));
    this.refreshBtn.setAttribute('data-tooltip', this.t('refreshTooltip'));
    this.importBtn.setAttribute('data-tooltip', this.t('importTooltip'));
  }

  public updateSaveButtonState(isDisabled: boolean): void {
    this.saveBtn.disabled = isDisabled;
  }

  public setRefreshButtonLoading(isLoading: boolean): void {
    this.refreshBtn.disabled = isLoading;
    if (isLoading) {
      this.refreshBtn.classList.add('loading');
    } else {
      this.refreshBtn.classList.remove('loading');
    }
  }
}