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
  if (store.get('env.useBundledMingw')) {
    return path.join(extraResourcesPath, 'mingw64');
  }
  return store.get('env.mingwPath');
}

