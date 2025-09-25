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

import { Injectable } from '@angular/core';

import { DebugService } from './debug.service';
import { BuildService } from './build.service';
import { BehaviorSubject } from 'rxjs';
import { FileService } from './file.service';
import { EditorService } from './editor.service';
import { HotkeysService } from './hotkeys.service';
import { ElectronService } from '../core/services';
import { SettingsService } from './settings.service';

export interface Command {
  name: string;
  /** Ant Design Icon or Codicon (with 'codicon-' prefix) */
  icon?: string;
  shortcut: string | null;
  enabled: () => boolean;
  run: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class StatusService {

  statusMessage: BehaviorSubject<string> = new BehaviorSubject("");
  isDebugging= false;
  isBuilding = false;

  readonly commandList: {
    [key: string]: Command
  } = {
      'file.new': {
        name: '新建源文件',
        icon: 'codicon-new-file',
        shortcut: 'control.n',
        enabled: () => true,
        run: () => this.fileService.new()
      },
      'file.open': {
        name: '打开源文件...',
        icon: 'folder-open',
        shortcut: 'control.o',
        enabled: () => true,
        run: () => this.fileService.open()
      },
      'file.save': {
        name: '保存',
        icon: 'save',
        shortcut: 'control.s',
        enabled: () => this.saveEnabled,
        run: () => this.fileService.save()
      },
      'file.saveAs': {
        name: '另存为...',
        shortcut: 'control.shift.s',
        enabled: () => this.saveEnabled,
        run: () => this.fileService.saveAs()
      },
      'edit.undo': {
        name: '撤销',
        icon: 'codicon-discard',
        shortcut: 'control.z',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('undo')
      },
      'edit.redo': {
        name: '恢复',
        icon: 'codicon-redo',
        shortcut: 'control.y',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('redo')
      },
      'edit.copy': {
        name: '复制',
        icon: 'copy',
        shortcut: 'control.c',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.clipboardCopyAction')
      },
      'edit.cut': {
        name: '剪切',
        icon: 'scissor',
        shortcut: 'control.x',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.clipboardCutAction')
      },
      'edit.paste': {
        name: '粘贴',
        icon: 'snippets',
        shortcut: 'control.v',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.clipboardPasteAction')
      },
      'edit.selectAll': {
        name: '选择全部',
        shortcut: 'control.a',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.selectAll')
      },
      'edit.find': {
        name: '搜索',
        icon: 'search',
        shortcut: 'control.f',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('actions.find')
      },
      'edit.replace': {
        name: '替换',
        icon: 'codicon-replace',
        shortcut: 'control.h',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.startFindReplaceAction')
      },
      'edit.commentLine': {
        name: '切换行注释',
        icon: 'codicon-comment',
        shortcut: 'control./',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.commentLine')
      },
      'edit.zoomIn': {
        name: '放大',
        shortcut: 'control.=',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.fontZoomIn')
      },
      'edit.zoomOut': {
        name: '缩小',
        shortcut: 'control.-',
        enabled: () => this.hasFile,
        run: () => this.editorService.runAction('editor.action.fontZoomOut')
      },
      'build.build': {
        name: '编译',
        icon: 'build',
        shortcut: 'f9',
        enabled: () => this.saveEnabled,
        run: () => this.buildService.compile()
      },
      'build.run': {
        name: '运行',
        icon: 'codicon-play',
        shortcut: 'f10',
        enabled: () => this.saveEnabled,
        run: () => this.buildService.runExe()
      },
      'build.buildRun': {
        name: '编译并运行',
        icon: 'codicon-run-all',
        shortcut: 'f11',
        enabled: () => this.saveEnabled,
        run: () => this.buildService.runExe(true)
      },
      'debug.start': {
        name: '开始调试',
        icon: 'codicon-debug-alt-small',
        shortcut: 'f5',
        enabled: () => this.hasFile && !this.isDebugging,
        run: () => this.debugService.startDebug()
      },
      'debug.exit': {
        name: '结束调试',
        icon: 'codicon-debug-stop',
        shortcut: 'f6',
        enabled: () => this.hasFile && this.isDebugging,
        run: () => this.debugService.exitDebug()
      },
      'tool.openBuildSetting': {
        name: '编译设置...',
        shortcut: null,
        enabled: () => true,
        run: () => this.settingsService.openSetting('build')
      },
      'tool.openEditorSetting': {
        name: '编辑器设置...',
        shortcut: null,
        enabled: () => true,
        run: () => this.settingsService.openSetting('editor')
      },
      'window.toggleDevtools': {
        name: '切换 DevTools',
        icon: 'codicon-debug-console',
        shortcut: null,
        enabled: () => true,
        run: () => this.electronService.ipcRenderer.invoke('window/toggleDevTools')
      }
    };

  constructor(
    private electronService: ElectronService,
    private hotkeysService: HotkeysService,
    private editorService: EditorService,
    private fileService: FileService,
    private debugService: DebugService,
    private buildService: BuildService,
    private settingsService: SettingsService
  ) {
    this.debugService.isDebugging$.subscribe(v => this.isDebugging = v);
    this.buildService.isBuilding$.subscribe(v => this.isBuilding = v);

    for (const id in this.commandList) {
      if (["edit.copy", "edit.cut", "edit.paste", "edit.selectAll"].includes(id)) continue;
      const shortcut = this.commandList[id].shortcut;
      if (shortcut !== null) {
        this.hotkeysService.addShortcut({
          keys: shortcut
        }).subscribe(() => {
          if (this.commandList[id].enabled())
            this.commandList[id].run();
        });
      }
    }
  }

  get saveEnabled() {
    return this.fileService.currentFileType() !== "none" && !this.isDebugging && !this.isBuilding;
  }
  get hasFile() {
    return this.fileService.currentFileType() !== "none";
  }
}
