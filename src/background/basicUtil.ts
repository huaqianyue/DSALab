import * as fs from "fs";
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import * as isAsar from 'electron-is-running-in-asar';
import * as Store from 'electron-store';
// import * as chcp from 'chcp';
// 临时替代实现，绕过chcp模块
const chcp = {
  getAnsiCodePage: () => 936 // 默认中文编码
};
import { TypedIpcMain, TypedWebContents } from 'electron-typed-ipc';

import { IpcEvents, IpcCommands, Configurations } from './ipcTyping';

// very stupid to import a package, but useful.
export const extraResourcesPath =
  !isAsar()
    ? path.join(__dirname, '../src/extraResources')
    : path.join(process['resourcesPath'], 'extraResources');

export function getWindow(): BrowserWindow {
  return global["win"];
}
export function getWebContents(): TypedWebContents<IpcEvents> {
  return getWindow().webContents;
}

export const typedIpcMain = ipcMain as TypedIpcMain<IpcEvents, IpcCommands>;

export function getACP(): number {
  return chcp.getAnsiCodePage();
}

export const store = new Store<Configurations>({
  defaults: {
    'build.compileArgs': [
      '-g', '-std=c++20', 'DYN-fexec-charset'
    ],
    'env.mingwPath': '',
    'env.useBundledMingw': fs.existsSync(path.join(extraResourcesPath, "mingw64")),
    'advanced.ioEncoding': 'cp936',
    'theme.active': 'Light_plus'
  },
  accessPropertiesByDotNotation: false
});

export function getMingwPath(): string {
  const useBundledMingw = store.get('env.useBundledMingw');
  const customMingwPath = store.get('env.mingwPath');
  
  console.log('🔧 MinGW路径配置检查:');
  console.log('  - 使用内置MinGW:', useBundledMingw);
  console.log('  - 自定义MinGW路径:', customMingwPath);
  
  if (useBundledMingw) {
    const bundledPath = path.join(extraResourcesPath, 'mingw64');
    console.log('  - 选择内置MinGW路径:', bundledPath);
    return bundledPath;
  } else {
    console.log('  - 选择自定义MinGW路径:', customMingwPath);
    return customMingwPath;
  }
}

