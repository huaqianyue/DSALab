// src/components/ProblemListComponent.ts

import { Problem, Translations } from '../types';

interface ProblemListEvents {
  onProblemSelect: (problemId: string) => Promise<void>;
}

export class ProblemListComponent {
  private problemListUl: HTMLUListElement; // 明确指定为 HTMLUListElement
  private problems: Problem[] = [];
  private currentProblemId: string | null = null;
  private lastOpenedProblemId: string | null = null;
  private events: ProblemListEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;

  // 构造函数参数类型改为 HTMLUListElement
  constructor(container: HTMLUListElement, events: ProblemListEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.problemListUl = container;
    this.events = events;
    this.t = t;
  }

  public updateProblems(problems: Problem[], currentProblemId: string | null, lastOpenedProblemId: string | null): void {
    this.problems = problems;
    this.currentProblemId = currentProblemId;
    this.lastOpenedProblemId = lastOpenedProblemId;
    this.renderProblemList();
  }

  private renderProblemList(): void {
    this.problemListUl.innerHTML = '';

    this.problems.forEach((problem) => {
      const listItem = document.createElement('li');
      listItem.className = 'problem-item';
      listItem.setAttribute('data-problem-id', problem.id);

      if (problem.isDelete) {
        listItem.classList.add('deleted-problem');
      }

      let iconsHtml = '';
      if (problem.Code) {
        iconsHtml += `<i class="fas fa-code problem-icon code-icon" data-tooltip="${this.t('Code')}"></i>`;
      }
      if (problem.Audio) {
        iconsHtml += `<i class="fas fa-volume-up problem-icon audio-icon" data-tooltip="${this.t('Audio')}"></i>`;
      }

      listItem.innerHTML = `
        <span class="problem-title-text">${problem.shortDescription}</span>
        <span class="problem-action-icons">${iconsHtml}</span>
      `;

      if (problem.id === this.currentProblemId) {
        listItem.classList.add('active');
      } else if (problem.id === this.lastOpenedProblemId) {
        if (!this.currentProblemId) {
          listItem.classList.add('active');
        }
      }

      listItem.addEventListener('click', () => {
        this.events.onProblemSelect(problem.id);
      });
      this.problemListUl.appendChild(listItem);
    });
  }

  public activateProblemListTab(): void {
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.problem-description-panel .panel-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelector('[data-tab-target="problem-list"]')!.classList.add('active');
    document.querySelector('[data-tab-id="problem-list"]')!.classList.add('active');
  }
}