// src/utils/appLifecycle.ts
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'node:path';
import { flushAllHistoryBuffers } from './historyManager'; // 导入历史记录管理器
import { initPaths } from './paths'; // 导入路径初始化函数

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export const createWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../build/icon.png'),
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  Menu.setApplicationMenu(null);

  return mainWindow;
};

export function setupAppLifecycleHandlers() {
  // 注意：initPaths() 应该在 app.on('ready') 中被调用，
  // 确保 app 对象可用。这里只是定义函数，不立即执行。

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', async (event) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      event.preventDefault();
      console.log('Main process: Sending app-before-quit to renderer...');
      mainWindow.webContents.send('app-before-quit');

      await new Promise<void>(resolve => {
        ipcMain.once('app-quit-acknowledged', async () => {
          console.log('Main process: Renderer acknowledged quit, proceeding to flush all history buffers.');
          await flushAllHistoryBuffers();
          console.log('Main process: All history buffers flushed.');
          resolve();
        });
      });
    }
  });
}