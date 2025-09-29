import { Injectable } from '@angular/core';
import * as path from 'path';
import { ElectronService } from '../core/services';
import { EditorService } from './editor.service';

export interface Tab {
  key: string, // An unique udid for each tab
  type: "file" | "setting" | "welcome",
  title: string,
  code: string,
  path: string,
  saved: boolean
}

interface Enumerate<T> {
  index: number;
  value: T;
}
const nullEnum: Enumerate<any> = {
  index: null,
  value: null
};

interface TabOptions {
  key: string,
  type: "file" | "setting" | "welcome",
  title: string,
  code?: string,
  path?: string,
  saved?: boolean
}

// const initTab: Tab[] = [{
//   key: "aaa",
//   type: "file",
//   title: "a.cpp",
//   code: "int main() {}",
//   path: null,
//   saved: false
// }, {
//   key: "bbb",
//   type: "file",
//   title: "b.cpp",
//   code: "#include <cstdio>\nint main() { ; ; ; }",
//   path: null,
//   saved: false
// }];

@Injectable({
  providedIn: 'root'
})
export class TabsService {
  tabList: Tab[] = [];
  private activeTabKey: string = null;

  constructor(private electronService: ElectronService, private editorService: EditorService) {
    // TabsService controls how EditorService works.
    // When EditorService is not initialized, TabsService should do noting.
    // So I add `if (!this.editorService.isInit) return;` in each function
    // that use EditorService.
    // When initialization finished, it will send a event. TabsService will
    // do necessary initialization by calling `getActive` then.
    this.editorService.editorMessage.subscribe(({ type, arg }) => {
      if (type === "initCompleted") {
        this.getActive();
      }
    });

    // 延迟初始化欢迎标签页，确保路由系统已准备好
    setTimeout(() => {
      this.initializeWelcomeTab();
    }, 500);
  }

  private initializeWelcomeTab(): void {
    // 添加欢迎标签页
    this.add({
      key: 'welcome-tab',
      type: 'welcome',
      title: '欢迎使用DSALab',
      code: '',
      path: null,
      saved: true
    });
    
    // 立即激活欢迎标签页
    setTimeout(() => {
      this.changeActive('welcome-tab');
    }, 100);
  }

  syncActiveCode() {
    if (!this.editorService.isInit) return;
    if (this.getActive().value === null) return;
    if (this.getActive().value.type !== "file") return; // 只对文件类型标签页同步代码
    this.getActive().value.code = this.editorService.getCode();
  }

  getActive(): Enumerate<Tab> {
    if (this.activeTabKey === null) return nullEnum;
    return this.getByKey(this.activeTabKey);
  }

  getByKey(key: string): Enumerate<Tab> {
    const index = this.tabList.findIndex((x: Tab) => x.key === key);
    if (index === -1) return nullEnum;
    return {
      index,
      value: this.tabList[index]
    };
  }

  changeActive(key?: string): void;
  changeActive(index: number): void;
  changeActive(arg?: string | number): void {
    if (typeof arg === "undefined") {
      if (this.editorService.isInit) this.editorService.switchToModel(this.getActive().value);
      return;
    }
    if (this.activeTabKey !== null) {
      this.syncActiveCode();
    }
    if (typeof arg === "string") {
      this.activeTabKey = arg;
    }
    else if (typeof arg === "number") {
      this.activeTabKey = this.tabList[arg].key;
    }
    const newActive = this.getActive().value;
    if (newActive.type === "file" && this.editorService.isInit)
      this.editorService.switchToModel(newActive);
    this.electronService.ipcRenderer.invoke('window/setTitle', newActive.path ?? newActive.title);
  }

  get hasActiveFile() {
    const activeTab = this.getActive().value;
    return activeTab !== null && activeTab.type === "file";
  }

  add(options: TabOptions) {
    const newTab: Tab = {
      key: options.key,
      type: options.type,
      title: options.title,
      code: options.code ?? "",
      saved: options.saved ?? (!(options.type === "file" && typeof options.path === "undefined")), // 使用传入的saved值，如果没有则根据文件类型判断
      path: options.path ?? null
    };
    this.tabList.push(newTab);
  }

  /** @return new active index */
  remove(key: string, force: boolean = false): number {
    // Clone it, for we will remove it's src later
    const tabEnum = this.getByKey(key);
    if (tabEnum.index === -1) {
      console.warn(`Tab with key ${key} not found, cannot remove`);
      return -1;
    }
    
    // 保护DSALab标签页，除非强制删除
    if (key.startsWith('dsalab-') && !force) {
      console.warn(`DSALab tab ${key} cannot be removed without force flag`);
      return -1;
    }
    
    const index = tabEnum.index;
    let newIndex = -1;
    const target: Tab = { ...this.tabList[index] };
    this.tabList.splice(index, 1);
    // closing current tab
    if (this.activeTabKey === key) {
      this.activeTabKey = null;
      if (this.tabList.length === 0) {
        // The only tab in MainView
        this.electronService.ipcRenderer.invoke('window/setTitle', '');
      } else if (index === this.tabList.length) {
        // The last tab, move to front
        newIndex = index - 1;
      } else {
        // Stay on current index (next tab)
        newIndex = index;
      }
    }
    if (target && target.type === "file")
      this.editorService.destroy(target);
    return newIndex;
  }

  saveCode(key: string, savePath: string): void {
    if (!this.editorService.isInit) return;
    const target = this.getByKey(key).value;
    const oldPath = target.path;
    target.saved = true;
    target.path = savePath;
    target.title = path.basename(savePath);
    this.editorService.switchToModel(target, savePath !== oldPath);
  }
}
