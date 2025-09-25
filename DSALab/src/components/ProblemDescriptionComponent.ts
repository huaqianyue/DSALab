// src/components/ProblemDescriptionComponent.ts

import { Problem, Translations } from '../types';

interface ProblemDescriptionEvents {
  onNavigate: (direction: -1 | 1) => void;
}

export class ProblemDescriptionComponent {
  private container: HTMLElement;
  private events: ProblemDescriptionEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;
  private problems: Problem[] = [];
  private currentProblemId: string | null = null;

  constructor(container: HTMLElement, events: ProblemDescriptionEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.container = container;
    this.events = events;
    this.t = t;
  }

  public update(problem: Problem | null, allProblems: Problem[], currentProblemId: string | null): void {
    this.problems = allProblems;
    this.currentProblemId = currentProblemId;
    this.render(problem);
  }

  private render(problem: Problem | null): void {
    if (problem) {
      this.container.innerHTML = `
        <h2>${problem.shortDescription}</h2>
        <p>${problem.fullDescription}</p>
        <div class="problem-navigation-buttons">
          <button id="prevProblemBtn" class="btn-audio" data-tooltip="${this.t('prevProblemTooltip')}">
            <i class="fas fa-arrow-left"></i> ${this.t('prevProblem')}
          </button>
          <button id="nextProblemBtn" class="btn-audio" data-tooltip="${this.t('nextProblemTooltip')}">
            ${this.t('nextProblem')} <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
      this.attachEventListeners();
      this.updateNavigationButtons();
    } else {
      this.container.innerHTML = `<p>${this.t('selectProblem')}</p>`;
    }
  }

  private attachEventListeners(): void {
    document.getElementById('prevProblemBtn')?.addEventListener('click', () => this.events.onNavigate(-1));
    document.getElementById('nextProblemBtn')?.addEventListener('click', () => this.events.onNavigate(1));
  }

  private updateNavigationButtons(): void {
    const prevBtn = document.getElementById('prevProblemBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextProblemBtn') as HTMLButtonElement;

    if (!prevBtn || !nextBtn || !this.currentProblemId) return;

    const currentIndex = this.problems.findIndex(p => p.id === this.currentProblemId);

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === this.problems.length - 1;
  }

  public activateProblemDescriptionTab(): void {
    document.querySelectorAll('.problem-panel-tabs .problem-tab-header').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.problem-description-panel .panel-content').forEach(content => {
      content.classList.remove('active');
    });

    document.querySelector('[data-tab-target="problem-description"]')!.classList.add('active');
    document.querySelector('[data-tab-id="problem-description"]')!.classList.add('active');
  }
}