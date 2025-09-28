// Copyright (C) 2021 Guyutongxue
//
// This file is part of Dev-C++ 7.
//
// Dev-C++ 7 is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Dev-C++ 7 is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Dev-C++ 7.  If not, see <http://www.gnu.org/licenses/>.

import { Injectable, Injector, inject } from '@angular/core';
import { MonacoEditorLoaderService } from '@materia-ui/ngx-monaco-editor';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, take } from 'rxjs/operators';

import { Tab } from './tabs.service';
import { ElectronService } from '../core/services';
import { cppLang, cppLangConf } from '../configs/cppLanguageConfig';
import { SimplifiedContentChange } from './dsalab-types';

// All standard C++ headers filename
const stdCppHeaders = [
  'concepts', 'coroutine', 'cstdlib', 'csignal', 'csetjmp', 'cstdarg', 'typeinfo', 'typeindex', 'type_traits', 'bitset', 'functional', 'utility', 'ctime', 'chrono', 'cstddef', 'initializer_list', 'tuple', 'any', 'optional', 'variant', 'compare', 'version', 'source_location', 'new', 'memory', 'scoped_allocator', 'memory_resource', 'climits', 'cfloat', 'cstdint', 'cinttypes', 'limits', 'exception', 'stdexcept', 'cassert', 'system_error', 'cerrno', 'cctype', 'cwctype', 'cstring', 'cwchar', 'cuchar', 'string', 'string_view', 'charconv', 'format', 'array', 'vector', 'deque', 'list', 'forward_list', 'set', 'map', 'unordered_set', 'unordered_map', 'stack', 'queue', 'span', 'iterator', 'ranges', 'algorithm', 'execution', 'cmath', 'complex', 'valarray', 'random', 'numeric', 'ratio', 'cfenv', 'bit', 'numbers', 'locale', 'clocale', 'codecvt', 'iosfwd', 'ios', 'istream', 'ostream', 'iostream', 'fstream', 'sstream', 'syncstream', 'strstream', 'iomanip', 'streambuf', 'cstdio', 'filesystem', 'regex', 'atomic', 'thread', 'stop_token', 'mutex', 'shared_mutex', 'future', 'condition_variable', 'semaphore', 'latch', 'barrier'
];

function isCpp(filename: string) {
  if (stdCppHeaders.includes(filename)) return true;
  const ext = filename.split('.').pop();
  return ['cc', 'cxx', 'cpp', 'h'].includes(ext);
}


interface EditorBreakpointDecInfo {
  id: string;
  hitCount: number | null;
  expression: string | null;
}

export interface EditorBreakpointInfo extends EditorBreakpointDecInfo {
  line: number;
}

interface ModelInfo {
  cursor: monaco.IPosition;
  scrollTop: number;
  bkptDecs: EditorBreakpointDecInfo[];
}

@Injectable({
  providedIn: 'root'
})
export class EditorService {
  isInit = false;
  editorMessage: Subject<{ type: string; arg?: any }> = new Subject();

  // Root path of new files, `extraResources/anon_workspace`
  private nullPath = '/anon_workspace/';

  private editor: monaco.editor.IStandaloneCodeEditor;
  private editorText = new BehaviorSubject<string>("");
  editorText$ = this.editorText.asObservable();
  private previousModelContent = ''; // 用于记录编辑前的内容
  private lastUndoRedoTime = 0; // 记录最后一次撤销/重做的时间
  private isUndoRedo = false; // 标记当前是否为撤销/重做操作

  private modelInfos: { [uri: string]: ModelInfo } = {};
  private breakpointInfos = new BehaviorSubject<EditorBreakpointInfo[]>([]);
  breakpointInfos$ = this.breakpointInfos.asObservable();

  private traceDecoration: string[];
  private lastTraceUri: monaco.Uri = null;

  private dsalabProblemService: any; // 延迟加载以避免循环依赖
  private isComposing = false; // 用于识别IME输入

  constructor(
    private monacoEditorLoaderService: MonacoEditorLoaderService, 
    private electronService: ElectronService,
    private injector: Injector
  ) {
    this.editorText.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe((_) => {
      const model = this.editor?.getModel();
      if (model) {
        this.updateBkptInfo(model);
      }
    });

    this.monacoEditorLoaderService.isMonacoLoaded$.pipe(
      filter(isLoaded => isLoaded),
      take(1)
    ).subscribe(() => {
      monaco.languages.register({
        id: 'cpp',
        extensions: [
          '.cc', '.cxx', '.cpp', '.h'
        ],
        aliases: ['C++', 'Cpp', 'cpp']
      });
      monaco.languages.setMonarchTokensProvider('cpp', cppLang);
      monaco.languages.setLanguageConfiguration('cpp', cppLangConf);
    });

    this.electronService.ipcRenderer.invoke('window/getExtraResourcePath')?.then(v => {
      this.nullPath = v + '/anon_workspace/';
    });

  }

  private getUri(tab: Tab): monaco.Uri {
    let uri = tab.type + "://";
    if (tab.path === null) uri += this.nullPath + tab.title;
    else uri += '/' + tab.path.replace(/\\/g, '/');
    return monaco.Uri.parse(uri);
  }

  /** Turn breakpoint info to editor decoration */
  private bkptInfoToDecoration(line: number): monaco.editor.IModelDeltaDecoration {
    return {
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'bkpt-line-decoration',
        glyphMarginClassName: 'bkpt-glyph-margin codicon codicon-circle-filled',
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    };
  }

  // 添加键盘事件监听器来检测撤销/重做操作
  private addKeyboardListeners() {
    this.editor.onKeyDown((e) => {
      // 检测Ctrl+Z (撤销) 或 Ctrl+Y/Ctrl+Shift+Z (重做)
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.keyCode === monaco.KeyCode.KEY_Z && !e.shiftKey) {
          // Ctrl+Z - 撤销
          console.log('🔄 检测到Ctrl+Z撤销操作');
          this.isUndoRedo = true;
          this.lastUndoRedoTime = Date.now();
          setTimeout(() => {
            this.isUndoRedo = false;
          }, 200);
        } else if (e.keyCode === monaco.KeyCode.KEY_Y || 
                  (e.keyCode === monaco.KeyCode.KEY_Z && e.shiftKey)) {
          // Ctrl+Y 或 Ctrl+Shift+Z - 重做
          console.log('🔄 检测到重做操作');
          this.isUndoRedo = true;
          this.lastUndoRedoTime = Date.now();
          setTimeout(() => {
            this.isUndoRedo = false;
          }, 200);
        }
      }
    });
  }

  // https://github.com/microsoft/monaco-editor/issues/2195#issuecomment-711471692
  private addMissingActions() {
    this.editor.addAction({
      id: 'undo',
      label: 'Undo',
      run: () => {
        this.editor?.focus();
        // 标记为撤销操作
        this.isUndoRedo = true;
        this.lastUndoRedoTime = Date.now();
        (this.editor.getModel() as any).undo();
        // 短暂延迟后重置标志
        setTimeout(() => {
          this.isUndoRedo = false;
        }, 100);
      },
    });
    this.editor.addAction({
      id: 'redo',
      label: 'Redo',
      run: () => {
        this.editor?.focus();
        // 标记为重做操作
        this.isUndoRedo = true;
        this.lastUndoRedoTime = Date.now();
        (this.editor.getModel() as any).redo();
        // 短暂延迟后重置标志
        setTimeout(() => {
          this.isUndoRedo = false;
        }, 100);
      },
    });
    this.editor.addAction({
      id: 'editor.action.clipboardCutAction',
      label: 'Cut',
      run: () => {
        this.editor?.focus();
        document.execCommand('cut');
      },
    });
    this.editor.addAction({
      id: 'editor.action.clipboardCopyAction',
      label: 'Copy',
      run: () => {
        this.editor?.focus();
        document.execCommand('copy');
      },
    });
    this.editor.addAction({
      id: 'editor.action.clipboardPasteAction',
      label: 'Paste',
      run: () => {
        this.editor?.focus();
        document.execCommand('paste');
      },
    });
    // https://github.com/microsoft/monaco-editor/issues/2010
    this.editor.addAction({
      id: 'editor.action.selectAll',
      label: 'Select All',
      run: () => {
        this.editor?.focus();
        const range = this.editor.getModel().getFullModelRange();
        this.editor.setSelection(range);
      }
    });
  }


  // https://github.com/microsoft/monaco-editor/issues/2000
  private interceptOpenEditor() {
    const editorService = (this.editor as any)._codeEditorService;
    const openEditorBase = editorService.openCodeEditor.bind(editorService);
    editorService.openCodeEditor = async (input: { options: any, resource: monaco.Uri }, source) => {
      const result = await openEditorBase(input, source);
      if (result === null) {
        const selection: monaco.IRange = input.options?.selection;
        this.editorMessage.next({
          type: "requestOpen",
          arg: {
            selection: selection ?? ({ startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 } as monaco.IRange),
            path: input.resource.path.substr(1) // Remove prefix '/' from URI
          }
        });
      }
      return result;
    };
  }

  private mouseDownListener = (e: monaco.editor.IEditorMouseEvent) => {
    // Add or remove breakpoints
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const lineNumber = e.target.range.startLineNumber;
      const currentModel = this.editor.getModel();
      const uri = currentModel.uri.toString();
      const index = this.modelInfos[uri].bkptDecs.findIndex(v =>
        currentModel.getDecorationRange(v.id).startLineNumber === lineNumber
      );
      if (index !== -1) {
        currentModel.deltaDecorations([this.modelInfos[uri].bkptDecs[index].id], []);
        this.modelInfos[uri].bkptDecs.splice(index, 1);
      } else {
        this.modelInfos[uri].bkptDecs.push({
          id: currentModel.deltaDecorations([], [this.bkptInfoToDecoration(lineNumber)])[0],
          hitCount: null,
          expression: null
        });
      }
      this.updateBkptInfo(currentModel);
    }
  };

  editorInit(editor: monaco.editor.IStandaloneCodeEditor): void {
    this.editor = editor;
    
    // 确保主题已定义后再设置
    this.monacoEditorLoaderService.isMonacoLoaded$.pipe(
      filter(isLoaded => isLoaded),
      take(1)
    ).subscribe(() => {
      // 尝试使用自定义主题，如果失败则使用默认主题
      try {
        monaco.editor.setTheme('mytheme');
      } catch (error) {
        // 如果自定义主题不存在，使用默认的vs主题确保有语法高亮
        monaco.editor.setTheme('vs');
      }
    });
    
    this.interceptOpenEditor();
    this.addMissingActions();
    this.addKeyboardListeners();
    this.editor.onMouseDown(this.mouseDownListener);
    
    // 添加IME输入检测（复刻DSALab逻辑）
    const editorDom = this.editor.getDomNode();
    if (editorDom) {
      editorDom.addEventListener('compositionstart', () => { this.isComposing = true; });
      editorDom.addEventListener('compositionend', () => { this.isComposing = false; });
    }
    this.editor.onDidChangeModel((e) => {
      if (e.newModelUrl) {
        const model = monaco.editor.getModel(e.newModelUrl);
        if (model) {
          this.editorText.next(model.getValue());
        } else {
          console.warn('Model not found for URL:', e.newModelUrl);
          this.editorText.next('');
        }
      } else {
        console.warn('newModelUrl is null in onDidChangeModel event');
        this.editorText.next('');
      }
    });
    this.isInit = true;
    this.editorMessage.next({ type: "initCompleted" });
  }

  editorDestroy(): void {
    this.editorText.next("");
    this.editor = null;
    this.isInit = false;
  }

  /**
   * 获取DSALab问题服务（延迟加载）
   */
  private getDSALabProblemService() {
    if (!this.dsalabProblemService) {
      try {
        // 尝试从全局注入器获取服务
        const DSALabProblemService = require('./dsalab-problem.service').DSALabProblemService;
        this.dsalabProblemService = this.injector.get(DSALabProblemService, null);
      } catch (error) {
        // 如果获取失败，暂时跳过历史记录
        console.warn('DSALabProblemService not available for history recording:', error);
        return null;
      }
    }
    return this.dsalabProblemService;
  }

  /**
   * 记录DSALab问题的代码编辑历史
   */
  private recordDSALabCodeEditHistory(tab: Tab, contentChangeEvent: monaco.editor.IModelContentChangedEvent): void {
    try {
      const problemId = tab.key.replace('dsalab-', '');
      console.log('🔍 Attempting to record code edit history for problem:', problemId);
      
      const currentPosition = this.editor?.getPosition();
      if (!currentPosition) {
        console.log('❌ No current position available');
        return;
      }

      const dsalabService = this.getDSALabProblemService();
      if (!dsalabService) {
        console.log('❌ DSALabProblemService not available');
        return;
      }
      
      console.log('✅ DSALabProblemService loaded successfully');

      // 处理每个内容变化
      for (const change of contentChangeEvent.changes) {
        // 判断操作类型（增强版，支持撤销/重做检测）
        let operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'undo_redo' | 'other_edit' = 'other_edit';
        
        // 检查是否为撤销/重做操作（优先级最高）
        const currentTime = Date.now();
        const isRecentUndoRedo = this.isUndoRedo || (currentTime - this.lastUndoRedoTime < 300);
        
        if (this.isComposing) {
          operationType = 'ime_input';
        } else if (isRecentUndoRedo) {
          // 撤销/重做操作使用专门的类型
          operationType = 'undo_redo';
          console.log(`🔄 撤销/重做操作被正确识别，文本长度: ${change.text.length}, 范围长度: ${change.rangeLength}`);
        } else if (change.text.length > 0 && change.rangeLength === 0) {
          // 插入操作：单字符为type，多字符为paste_insert
          operationType = change.text.length === 1 ? 'type' : 'paste_insert';
        } else if (change.text.length === 0 && change.rangeLength > 0) {
          // 删除操作
          operationType = 'delete';
        } else if (change.text.length > 0 && change.rangeLength > 0) {
          // 替换操作：即粘贴替换
          operationType = 'paste_replace';
        }

        // 获取被删除的文本（对于删除和替换操作）
        let deletedText = '';
        if ((operationType === 'delete' || operationType === 'paste_replace') && change.rangeLength > 0) {
          try {
            // 使用之前保存的内容和范围信息来计算被删除的文本
            if (this.previousModelContent) {
              const startOffset = change.rangeOffset;
              const endOffset = change.rangeOffset + change.rangeLength;
              if (startOffset >= 0 && endOffset <= this.previousModelContent.length) {
                deletedText = this.previousModelContent.substring(startOffset, endOffset);
                console.log(`🗑️ 捕获到被删除的文本: "${deletedText}"`);
              } else {
                deletedText = `[已删除${change.rangeLength}个字符]`;
              }
            } else {
              deletedText = `[已删除${change.rangeLength}个字符]`;
            }
          } catch (error) {
            console.warn('获取删除文本时出错:', error);
            deletedText = `[已删除${change.rangeLength}个字符]`;
          }
        }

        console.log(`📝 Code edit detected: ${operationType} | text: "${change.text}" (${change.text.length} chars) | rangeLength: ${change.rangeLength}${deletedText ? ` | deletedText: "${deletedText}"` : ''}`);

        // 构造简化的内容变化对象
        // 修正Monaco编辑器的范围计算问题
        let correctedRange = { ...change.range };
        if (operationType === 'type' && change.text.length > 0) {
          // 对于type操作，endColumn应该是startColumn + text.length
          correctedRange.endColumn = correctedRange.startColumn + change.text.length;
          console.log(`📐 范围修正: type操作 "${change.text}" 原始范围=${change.range.startColumn}-${change.range.endColumn}, 修正范围=${correctedRange.startColumn}-${correctedRange.endColumn}`);
        }
        
        const simplifiedChange: SimplifiedContentChange = {
          range: {
            startLineNumber: correctedRange.startLineNumber,
            startColumn: correctedRange.startColumn,
            endLineNumber: correctedRange.endLineNumber,
            endColumn: correctedRange.endColumn
          },
          rangeLength: change.rangeLength,
          text: change.text,
          rangeOffset: change.rangeOffset,
          deletedText: deletedText || undefined
        };

        // 记录历史事件
        // 对于type操作，光标位置应该是修正后range的结束位置
        // 对于delete操作，光标位置应该是range的开始位置
        let correctCursorPosition;
        if (operationType === 'type' || operationType === 'paste_insert' || operationType === 'paste_replace') {
          correctCursorPosition = {
            lineNumber: correctedRange.endLineNumber,
            column: correctedRange.endColumn
          };
        } else if (operationType === 'delete') {
          correctCursorPosition = {
            lineNumber: correctedRange.startLineNumber,
            column: correctedRange.startColumn
          };
        } else {
          correctCursorPosition = {
            lineNumber: currentPosition.lineNumber,
            column: currentPosition.column
          };
        }
        
        console.log(`📍 光标位置修正: 操作=${operationType}, 原始=${currentPosition.lineNumber}:${currentPosition.column}, 修正=${correctCursorPosition.lineNumber}:${correctCursorPosition.column}`);
        
        dsalabService.getHistoryService().recordCodeEditEvent(
          problemId,
          operationType,
          simplifiedChange,
          correctCursorPosition
        );
      }
    } catch (error) {
      console.error('Failed to record DSALab code edit history:', error);
    }
  }

  setEditorTheme(theme: monaco.editor.IStandaloneThemeData): void {
    this.monacoEditorLoaderService.isMonacoLoaded$.pipe(
      filter(isLoaded => isLoaded),
      take(1)
    ).subscribe(() => {
      monaco.editor.defineTheme('mytheme', theme);
      // 应用主题到编辑器
      if (this.editor) {
        this.editor.updateOptions({ theme: 'mytheme' });
      }
    });
  }

  switchToModel(tab: Tab, replace = false): void {
    const uri = this.getUri(tab);
    const newUri = uri.toString();
    let newModel = monaco.editor.getModel(uri);
    const oldModel = this.editor.getModel();
    const oldUri = oldModel?.uri.toString();
    if (oldUri in this.modelInfos) {
      this.modelInfos[oldUri].cursor = this.editor.getPosition();
      this.modelInfos[oldUri].scrollTop = this.editor.getScrollTop();
    }
    if (newModel === null) {
      // DSALab标签页始终使用C++语言，其他文件根据扩展名判断
      const language = tab.key.startsWith('dsalab-') ? 'cpp' : (isCpp(tab.title) ? 'cpp' : 'text');
      newModel = monaco.editor.createModel(tab.code, language, uri);
      // 初始化时保存当前内容
      this.previousModelContent = newModel.getValue();
      
      newModel.onDidChangeContent((e) => {
        tab.saved = false;
        
        // 记录DSALab问题的代码编辑历史（使用之前保存的内容来获取删除文本）
        if (tab.key.startsWith('dsalab-')) {
          this.recordDSALabCodeEditHistory(tab, e);
        }
        
        // 更新内容状态
        this.editorText.next(newModel.getValue());
        
        // 更新previousModelContent为当前内容（用于下次变化时获取删除的文本）
        this.previousModelContent = newModel.getValue();
      });
      this.modelInfos[newUri] = {
        cursor: { column: 1, lineNumber: 1 },
        scrollTop: 0,
        bkptDecs: [],
      };
      if (replace && oldModel !== null) {
        // "Inherit" old decorations to new model
        for (const bkptInfo of this.modelInfos[oldUri].bkptDecs) {
          const line = oldModel.getDecorationRange(bkptInfo.id).startLineNumber;
          this.modelInfos[newUri].bkptDecs.push({
            id: newModel.deltaDecorations([], [this.bkptInfoToDecoration(line)])[0],
            expression: bkptInfo.expression,
            hitCount: bkptInfo.hitCount
          });
        }
        this.modelInfos[newUri].cursor = this.modelInfos[oldUri].cursor;
        this.modelInfos[newUri].scrollTop = this.modelInfos[oldUri].scrollTop;
        delete this.modelInfos[oldUri];
      }
    }
    this.editor.setModel(newModel);
    
    // 切换模型时更新previousModelContent
    this.previousModelContent = newModel ? newModel.getValue() : '';
    
    console.log('switch to ', newUri, tab);
    if (replace) {
      oldModel.dispose();
    }
    this.editor.setPosition(this.modelInfos[newUri].cursor);
    this.editor.setScrollTop(this.modelInfos[newUri].scrollTop);
    this.editor.focus();
  }


  getCode() {
    if (!this.isInit) return "";
    return this.editor.getValue();
  }
  setSelection(range: monaco.IRange) {
    this.editor.setSelection(range);
    this.editor.revealRange(range);
    this.editor.focus();
  }
  setPosition(position: monaco.IPosition) {
    this.editor.setPosition(position);
    this.editor.revealLine(position.lineNumber);
    this.editor.focus();
  }

  runAction(id: string) {
    // console.log(id);
    if (!this.isInit) return;
    this.editor.getAction(id).run();
  }

  destroy(tab: Tab) {
    if (!tab) {
      console.warn('destroy: tab is null or undefined');
      return;
    }
    
    try {
      const uri = this.getUri(tab);
      console.log('destroy ', uri.toString());
      const target = monaco.editor.getModel(uri);
      delete this.modelInfos[uri.toString()];
      if (this.lastTraceUri === uri) this.lastTraceUri = null;
      if (target) {
        target.dispose();
      }
    } catch (error) {
      console.error('Error in destroy method:', error);
    }
  }

  private updateBkptInfo(model: monaco.editor.ITextModel) {
    const uri = model.uri.toString();
    if (uri in this.modelInfos)
      this.breakpointInfos.next(this.modelInfos[uri].bkptDecs.map(dec => ({
        line: model.getDecorationRange(dec.id).startLineNumber,
        ...dec
      })));
  }

  changeBkptCondition(id: string, expression: string) {
    const currentModel = this.editor.getModel();
    this.modelInfos[currentModel.uri.toString()].bkptDecs.find(v => v.id === id).expression = expression;
    this.updateBkptInfo(currentModel);
  }

  // 清除所有断点
  clearAllBreakpoints(): void {
    console.log('🧹 Starting to clear all breakpoints...');
    
    // 清除所有模型的断点信息
    Object.keys(this.modelInfos).forEach(modelUri => {
      if (this.modelInfos[modelUri].bkptDecs.length > 0) {
        try {
          const model = monaco.editor.getModel(monaco.Uri.parse(modelUri));
          if (model) {
            const decorationIds = this.modelInfos[modelUri].bkptDecs.map(dec => dec.id);
            model.deltaDecorations(decorationIds, []);
            console.log(`🧹 Cleared ${decorationIds.length} breakpoint decorations in ${modelUri}`);
          }
          this.modelInfos[modelUri].bkptDecs = [];
        } catch (error) {
          console.warn('Error clearing breakpoints for model:', modelUri, error);
          // 即使出错也要清空数据
          this.modelInfos[modelUri].bkptDecs = [];
        }
      }
    });
    
    // 无论如何都要清空全局断点信息
    this.breakpointInfos.next([]);
    console.log('🧹 Global breakpoint information cleared');
    
    // 如果有当前编辑器，也更新一下
    if (this.editor) {
      const currentModel = this.editor.getModel();
      if (currentModel) {
        this.updateBkptInfo(currentModel);
      }
    }
  }

  showTrace(line: number) {
    this.hideTrace();
    const currentModel = this.editor.getModel();
    this.traceDecoration = currentModel.deltaDecorations(this.traceDecoration, [{
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'trace-line-decoration',
        glyphMarginClassName: 'trace-glyph-margin codicon codicon-debug-stackframe',
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }]);
    this.lastTraceUri = currentModel.uri;
    this.editor.revealLine(line);
  }
  hideTrace() {
    if (this.lastTraceUri !== null)
      monaco.editor.getModel(this.lastTraceUri)?.deltaDecorations(this.traceDecoration, []);
    this.traceDecoration = [];
  }
}
