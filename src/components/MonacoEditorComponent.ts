// src/components/MonacoEditorComponent.ts

import * as monaco from 'monaco-editor';
import { SimplifiedContentChange, CodeEditEvent } from '../types';

interface MonacoEditorOptions {
  initialValue: string;
  language?: string;
  theme?: string;
  fontSize?: number;
  fontFamily?: string;
  minimap?: boolean;
  wordWrap?: boolean;
  lineNumbers?: boolean;
  tabSize?: number;
}

interface MonacoEditorEvents {
  onContentChange: (changes: SimplifiedContentChange[], cursorPosition: { lineNumber: number; column: number }, operationType: CodeEditEvent['operationType']) => void;
}

export class MonacoEditorComponent {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private isComposing: boolean = false; // 用于跟踪输入法合成状态
  private events: MonacoEditorEvents;

  constructor(container: HTMLElement, options: MonacoEditorOptions, events: MonacoEditorEvents) {
    this.events = events;
    this.initializeMonacoTheme();
    this.createEditor(container, options);
  }

  private initializeMonacoTheme(): void {
    monaco.editor.defineTheme('github-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7d8590' },
        { token: 'keyword', foreground: 'ff7b72' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'number', foreground: '79c0ff' },
        { token: 'regexp', foreground: '7ee787' },
        { token: 'operator', foreground: 'ff7b72' },
        { token: 'namespace', foreground: 'ffa657' },
        { token: 'type', foreground: 'ffa657' },
        { token: 'struct', foreground: 'ffa657' },
        { token: 'class', foreground: 'ffa657' },
        { token: 'interface', foreground: 'ffa657' },
        { token: 'parameter', foreground: 'ffa657' },
        { token: 'variable', foreground: 'ffa657' },
        { token: 'function', foreground: 'd2a8ff' },
        { token: 'method', foreground: 'd2a8ff' }
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editorLineNumber.foreground': '#30363d',
        'editorLineNumber.activeForeground': '#6e7681',
        'editor.selectionBackground': '#264f78',
        'editor.selectionHighlightBackground': '#264f7840',
        'editorCursor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#21262d50'
      }
    });

    monaco.editor.defineTheme('tomorrow-night-bright', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '969896', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'd54e53' },
        { token: 'string', foreground: 'b9ca4a' },
        { token: 'number', foreground: 'e78c45' },
        { token: 'regexp', foreground: 'b9ca4a' },
        { token: 'operator', foreground: 'd54e53' },
        { token: 'namespace', foreground: 'e7c547' },
        { token: 'type', foreground: 'e7c547' },
        { token: 'struct', foreground: 'e7c547' },
        { token: 'class', foreground: 'e7c547' },
        { token: 'interface', foreground: 'e7c547' },
        { token: 'parameter', foreground: 'e7c547' },
        { token: 'variable', foreground: 'eaeaea' },
        { token: 'function', foreground: '7aa6da' },
        { token: 'method', foreground: '7aa6da' }
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#eaeaea',
        'editorLineNumber.foreground': '#666666',
        'editorLineNumber.activeForeground': '#eaeaea',
        'editor.selectionBackground': '#424242',
        'editor.lineHighlightBackground': '#2a2a2a'
      }
    });
  }

  private createEditor(container: HTMLElement, options: MonacoEditorOptions): void {
    this.editor = monaco.editor.create(container, {
      value: options.initialValue,
      language: options.language || 'cpp',
      theme: options.theme || 'github-dark',
      fontSize: options.fontSize || 14,
      fontFamily: options.fontFamily || 'JetBrains Mono',
      minimap: { enabled: options.minimap !== undefined ? options.minimap : false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: options.tabSize || 4,
      insertSpaces: true,
      wordWrap: options.wordWrap ? 'on' : 'off',
      lineNumbers: options.lineNumbers ? 'on' : 'off',
      renderWhitespace: 'selection',
      contextmenu: false,
      mouseWheelZoom: true,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true
      },
      hover: { enabled: true },
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true },
      autoClosingBrackets: 'languageDefined',
      autoClosingQuotes: 'languageDefined',
      autoSurround: 'languageDefined'
    });

    container.addEventListener('compositionstart', () => { this.isComposing = true; });
    container.addEventListener('compositionend', () => { this.isComposing = false; });

    this.editor.onDidChangeModelContent((event) => {
      const cursorPosition = this.editor!.getPosition();
      for (const change of event.changes) {
        let operationType: CodeEditEvent['operationType'] = 'other_edit';

        if (this.isComposing) {
          operationType = 'ime_input';
        } else if (change.text.length > 0 && change.rangeLength === 0) {
          operationType = change.text.length === 1 ? 'type' : 'paste_insert';
        } else if (change.text.length === 0 && change.rangeLength > 0) {
          operationType = 'delete';
        } else if (change.text.length > 0 && change.rangeLength > 0) {
          operationType = 'paste_replace';
        }

        const simplifiedChange: SimplifiedContentChange = {
          range: {
            startLineNumber: change.range.startLineNumber,
            startColumn: change.range.startColumn,
            endLineNumber: change.range.endLineNumber,
            endColumn: change.range.endColumn,
          },
          rangeLength: change.rangeLength,
          text: change.text,
          rangeOffset: change.rangeOffset,
        };
        this.events.onContentChange([simplifiedChange], cursorPosition ? { lineNumber: cursorPosition.lineNumber, column: cursorPosition.column } : { lineNumber: 1, column: 1 }, operationType);
      }
    });
  }

  public setValue(value: string): void {
    this.editor?.setValue(value);
  }

  public getValue(): string {
    return this.editor?.getValue() || '';
  }

  public layout(): void {
    this.editor?.layout();
  }

  public getPosition(): monaco.Position | null {
    return this.editor?.getPosition() || null;
  }
}