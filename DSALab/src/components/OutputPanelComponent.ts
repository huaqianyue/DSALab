// src/components/OutputPanelComponent.ts

import { Translations } from '../types';

interface OutputPanelEvents {
  onUserInput: (input: string) => void;
}

export class OutputPanelComponent {
  private outputContainer: HTMLElement;
  private terminalInput: HTMLInputElement;
  private events: OutputPanelEvents;
  private t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string;
  private isProgramRunning: boolean = false;

  constructor(outputContainer: HTMLElement, terminalInput: HTMLInputElement, events: OutputPanelEvents, t: (key: keyof Translations, replacements?: { [key: string]: string | number }) => string) {
    this.outputContainer = outputContainer;
    this.terminalInput = terminalInput;
    this.events = events;
    this.t = t;
    this.setupTerminalInput();
  }

  private setupTerminalInput(): void {
    this.terminalInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && this.isProgramRunning) {
        const input = this.terminalInput.value;
        this.appendOutput('user-input', input); // 在终端显示用户输入
        this.events.onUserInput(input);
        this.terminalInput.value = '';
        event.preventDefault();
      }
    });
  }

  public appendOutput(type: string, text: string): void {
    const outputLine = document.createElement('div');
    outputLine.className = `output-${type}`;
    outputLine.innerHTML = type === 'user-input' ? `$&gt; ${text}` : text.replace(/\n/g, '<br>');
    this.outputContainer.appendChild(outputLine);
    this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
  }

  public clearOutput(): void {
    this.outputContainer.innerHTML = '';
    this.terminalInput.value = '';
  }

  public setProgramRunningState(isRunning: boolean): void {
    this.isProgramRunning = isRunning;
    this.terminalInput.disabled = !isRunning;
    if (isRunning) {
      this.terminalInput.focus();
    } else {
      this.terminalInput.value = '';
    }
  }

  public getOutputContent(): string {
    return this.outputContainer.innerHTML;
  }

  public restoreOutputContent(content: string): void {
    this.outputContainer.innerHTML = content;
    this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
  }

  public appendFriendlyError(error: Error): void {
    const errorLine = document.createElement('div');
    errorLine.className = 'output-error-friendly';

    let friendlyMessage = '';
    if (error.message.includes('Compilation failed')) {
      if (error.message.includes('g++ compiler not found')) {
        friendlyMessage = `❌ ${this.t('compilerNotFound')}：${error.message.replace('Compilation failed: g++ compiler not found or not in PATH.', '').trim()}\n请确保你的系统已安装 g++ 编译器，并且在 PATH 中可访问。`;
      } else {
        friendlyMessage = `❌ ${this.t('compilationFailed')}：请检查你的C++语法错误。\n详细信息: ${error.message}`;
      }
    } else if (error.message.includes('Execution timed out')) {
      friendlyMessage = `⚠️ ${this.t('executionTimedOut')}：你的程序运行时间过长，可能存在无限循环或性能问题。\n详细信息: ${error.message}`;
    } else if (error.message.includes('Execution failed')) {
      friendlyMessage = `❌ ${this.t('runtimeError')}：程序执行失败。\n详细信息: ${error.message}`;
    } else if (error.message.includes('Previous program was forcefully terminated')) {
      friendlyMessage = `⚠️ ${this.t('previousProgramTerminated')}`;
    } else if (error.message.includes('No program is currently running to receive input')) {
      friendlyMessage = `❌ ${this.t('noProgramToReceiveInput')}`;
    } else {
      friendlyMessage = `❌ ${this.t('error')}: ${error.message}`;
    }

    errorLine.innerHTML = friendlyMessage.replace(/\n/g, '<br>');
    this.outputContainer.appendChild(errorLine);
    this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
  }
}