import * as path from 'path';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';

import { store, typedIpcMain, extraResourcesPath } from "../basicUtil";
import { Configurations } from '../ipcTyping';



typedIpcMain.handle('store/get', (_, key) => {
  return store.get(key);
});


type SetStoreHandlerMap = {
  [K in keyof Configurations]?: (value: Configurations[K]) => boolean;
};

const setStoreHandlers: SetStoreHandlerMap = {
  'advanced.ioEncoding': (value) => {
    if (!iconv.encodingExists(value)) {
      console.error(`[Set IO Encoding] ${value} is not a valid encoding`);
      return false;
    }
    return true;
  },
  'build.compileArgs': () => true,
  'env.mingwPath': () => true,
  'env.useBundledMingw': () => true
};

typedIpcMain.handle('store/set', (_, key, value) => {
  if (key in setStoreHandlers) {
    const handler = setStoreHandlers[key] as (value: any) => boolean;
    if (!handler(value)) return;
  }
  store.set(key, value);
});

typedIpcMain.handle('store/reset', (_, key) => {
  if (typeof key === "undefined") {
    store.clear();
  } else {
    store.reset(key);
  }
});
