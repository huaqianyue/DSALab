// src/utils/fileDialogs.ts
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';

export function setupFileDialogHandlers(ipcMain: Electron.IpcMain) {
  ipcMain.handle('open-external', async (event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external URL:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('show-open-dialog', async (event, filters?: Electron.FileFilter[]) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: filters || [
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return { filePath, content: fileContent };
  });

  ipcMain.handle('show-save-dialog', async (event, currentFilePath: string | null, defaultFileName: string, content: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showSaveDialog(window, {
      defaultPath: currentFilePath || defaultFileName,
      filters: [
        { name: 'C++ Files', extensions: ['cpp', 'cxx', 'cc', 'c'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await fs.writeFile(result.filePath, content, 'utf-8');
    return result.filePath;
  });
}