import { Injectable } from '@angular/core';

// If you import a module but never use any of the imported values other than as TypeScript types,
// the resulting javascript file will look as if you never imported the module at all.
import { webFrame, remote } from 'electron';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import { TypedIpcRenderer } from 'electron-typed-ipc';

import { IpcEvents, IpcCommands, Configurations } from '../ipcTyping';


@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  ipcRenderer: TypedIpcRenderer<IpcEvents, IpcCommands>;
  webFrame: typeof webFrame;
  remote: typeof remote;
  childProcess: typeof childProcess;
  fs: typeof fs;

  get isElectron(): boolean {
    return !!(window && window.process && window.process.type);
  }

  constructor() {
    // Conditional imports
    if (this.isElectron) {
      // eslint-disable-next-line
      this.ipcRenderer = window.require('electron').ipcRenderer as any;
      this.webFrame = window.require('electron').webFrame;
      this.childProcess = window.require('child_process');
      this.fs = window.require('fs');
    } else {
      // do not make error in browser
      this.ipcRenderer = {
        on() { },
        send() { },
        sendSync() { },
        invoke() { }
      } as any;
    }
    this.getConfig('build.compileArgs');
  }

  async getConfig<K extends keyof Configurations> (key: K): Promise<Configurations[K]> {
    return this.ipcRenderer.invoke('store/get', key) as Promise<Configurations[K]>;
  }

  setConfig<K extends keyof Configurations> (key: K, value: Configurations[K]): void {
    this.ipcRenderer.invoke('store/set', key, value);
  }
}
