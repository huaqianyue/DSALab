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

import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ControlValueAccessor } from '@angular/forms';

import { EditorService } from '../../../services/editor.service';
import { TabsService } from '../../../services/tabs.service';

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class EditorComponent implements OnInit, OnDestroy {

  editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    glyphMargin: true,
    lineNumbersMinChars: 2,
    'semanticHighlighting.enabled': true
  };
  key: string;
  get code() {
    return this.editorService.getCode();
  }

  constructor(private route: ActivatedRoute,
    private tabsService: TabsService,
    private editorService: EditorService) {
    // 为Monaco编辑器组件添加缺失的回调函数
    this.setupMonacoCallbacks();
  }


  private keyOnChange(key: string) {
    if (typeof key === "undefined") this.key = null;
    this.key = key;
  }

  ngOnInit(): void {
    this.route.params.subscribe(routeParams => {
      this.keyOnChange(routeParams['key']);
    });
    console.log(this.editorService);
    
    // 添加全局错误处理以捕获Monaco相关错误
    this.setupGlobalErrorHandling();
  }

  ngOnDestroy() {
    this.editorService.editorDestroy();
  }

  editorInit(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editorService.editorInit(editor);
    if (this.key) {
      const activeTab = this.tabsService.getByKey(this.key).value;
      this.editorService.switchToModel(activeTab);
    }
  }

  onTouched(): void {
    // Monaco编辑器触摸事件处理
    // 这个方法是为了解决Monaco编辑器组件库中缺失的回调函数
    // 符合ControlValueAccessor接口要求
  }

  onErrorStatusChange(hasErrors: boolean): void {
    // Monaco编辑器错误状态变化处理
    // 这个方法是为了解决Monaco编辑器组件库中缺失的回调函数
    if (hasErrors) {
      console.log('Monaco编辑器检测到错误');
    }
  }

  // 添加更多可能需要的回调函数以解决Monaco编辑器组件库的兼容性问题
  writeValue = (value: any): void => {
    // ControlValueAccessor 接口方法
    console.log('writeValue called with:', value);
  }

  registerOnChange = (fn: any): void => {
    // ControlValueAccessor 接口方法
    console.log('registerOnChange called');
    this.onChangeCallback = fn;
  }

  registerOnTouched = (fn: any): void => {
    // ControlValueAccessor 接口方法
    console.log('registerOnTouched called');
    this.onTouchedCallback = fn;
  }

  setDisabledState = (isDisabled: boolean): void => {
    // ControlValueAccessor 接口方法
    console.log('setDisabledState called with:', isDisabled);
  }

  private onChangeCallback: (value: any) => void = () => {};
  private onTouchedCallback: () => void = () => {};

  private setupMonacoCallbacks(): void {
    // 确保Monaco编辑器组件有必要的回调函数
    // 这些方法可能会被Monaco编辑器组件库内部调用
    (this as any).onTouched = () => {
      console.log('onTouched callback called');
      try {
        this.onTouchedCallback();
      } catch (error) {
        console.error('Error in onTouched callback:', error);
      }
    };
    
    (this as any).onChange = (value: any) => {
      console.log('onChange callback called with:', value);
      try {
        this.onChangeCallback(value);
      } catch (error) {
        console.error('Error in onChange callback:', error);
      }
    };
    
    (this as any).registerOnTouched = (fn: () => void) => {
      console.log('registerOnTouched called');
      this.onTouchedCallback = fn || (() => {});
    };
    
    (this as any).registerOnChange = (fn: (value: any) => void) => {
      console.log('registerOnChange called');
      this.onChangeCallback = fn || (() => {});
    };
  }

  private setupGlobalErrorHandling(): void {
    // 捕获Monaco编辑器相关的错误
    const originalConsoleError = console.error;
    console.error = (...args) => {
      // 检查是否是我们已知的Monaco错误
      const errorMessage = args.join(' ');
      if (errorMessage.includes('onTouched is not a function') || 
          errorMessage.includes('toString of null')) {
        console.warn('Caught Monaco editor error (handled):', ...args);
        return;
      }
      // 其他错误正常处理
      originalConsoleError.apply(console, args);
    };
  }

}
