// src/components/ExportModalComponent.ts

import { Problem, Translations } from '../types';

interface ExportModalEvents {
  onConfirmExport: (problemIds: string[]) => Promise<void>;
  onAppendOutput: (type: string, text: string) => void;
}

export class ExportModalComponent {
  private exportModal: HTMLElement;
  private exportProblemList: HTMLUListElement;
  private cancelExportBtn: HTMLButtonElement;
  private confirmExportBtn: HTMLButtonElement;
  private closeExportModalBtn: HTMLElement;

  private events: ExportModalEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;

  constructor(events: ExportModalEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.exportModal = document.getElementById('exportModal') as HTMLElement;
    this.exportProblemList = document.getElementById('exportProblemList') as HTMLUListElement;
    this.cancelExportBtn = document.getElementById('cancelExportBtn') as HTMLButtonElement;
    this.confirmExportBtn = document.getElementById('confirmExportBtn') as HTMLButtonElement;
    this.closeExportModalBtn = this.exportModal?.querySelector('.close-button') as HTMLElement;

    if (!this.exportModal || !this.exportProblemList || !this.cancelExportBtn || !this.confirmExportBtn || !this.closeExportModalBtn) {
      console.error('Export modal elements not found!');
      throw new Error('Export modal elements missing.');
    }

    this.events = events;
    this.t = t;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.cancelExportBtn.addEventListener('click', () => this.closeModal());
    this.closeExportModalBtn.addEventListener('click', () => this.closeModal());
    this.confirmExportBtn.addEventListener('click', () => this.handleConfirm());

    this.exportModal.addEventListener('click', (e) => {
      if (e.target === this.exportModal) {
        this.closeModal();
      }
    });
  }

  public openModal(problems: Problem[], currentProblemId: string | null): void {
    this.exportProblemList.innerHTML = '';

    problems.forEach(problem => {
      const listItem = document.createElement('li');
      listItem.className = 'export-problem-item';
      listItem.setAttribute('data-problem-id', problem.id);

      let hasCode = problem.Code !== '';
      let hasAudio = problem.Audio !== '';
      let canExport = hasCode && hasAudio;

      let statusTextHtml = '';

      if (problem.isDelete) {
        canExport = false;
        statusTextHtml = ` <span class="export-status deleted-status">(${this.t('deletedProblem')})</span>`;
        listItem.classList.add('deleted-problem-export');
        listItem.classList.add('disabled-problem');
      } else {
        if (!canExport) {
          let missingParts: string[] = [];
          if (!hasCode) {
            missingParts.push(this.t('Code'));
          }
          if (!hasAudio) {
            missingParts.push(this.t('Audio'));
          }

          if (missingParts.length > 0) {
              let missingText = missingParts.join(this.t('or'));
              statusTextHtml = ` <span class="export-status missing-status">(${this.t('missing')}${missingText})</span>`;
          }
          listItem.classList.add('disabled-problem');
        }
      }

      listItem.innerHTML = `
        <label>
          <input type="checkbox" data-problem-id="${problem.id}" ${!canExport ? 'disabled' : ''} ${problem.id === currentProblemId && canExport ? 'checked' : ''}>
          <span>${problem.shortDescription}${statusTextHtml}</span>
        </label>
      `;

      if (problem.id === currentProblemId) {
        listItem.classList.add('active-problem');
      }

      this.exportProblemList.appendChild(listItem);
    });

    this.exportModal.classList.remove('hidden');
  }

  public closeModal(): void {
    this.exportModal.classList.add('hidden');
  }

  private async handleConfirm(): Promise<void> {
    const selectedProblemIds: string[] = [];
    this.exportProblemList.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)').forEach(checkbox => {
      selectedProblemIds.push((checkbox as HTMLInputElement).dataset.problemId!);
    });

    if (selectedProblemIds.length === 0) {
      this.events.onAppendOutput('info', '请选择至少一个题目进行导出。');
      return;
    }

    this.closeModal();
    await this.events.onConfirmExport(selectedProblemIds);
  }
}