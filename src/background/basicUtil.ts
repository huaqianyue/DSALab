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

