// src/utils/exportManager.ts
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { getUserWorkspacesRoot } from './paths';

export function setupExportManager(ipcMain: Electron.IpcMain) {
  ipcMain.handle('export-problems-to-zip', async (event, problemIds: string[], defaultFileName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, message: 'No active window.' };

    try {
      const saveResult = await dialog.showSaveDialog(window, {
        defaultPath: defaultFileName,
        filters: [
          { name: 'Zip Archives', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Export cancelled by user.' };
      }

      const output = createWriteStream(saveResult.filePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
          console.warn('Archiver warning (file not found):', err.path);
        } else {
          console.error('Archiver warning:', err);
        }
      });

      archive.on('error', function(err) {
        throw err;
      });

      archive.pipe(output);

      for (const problemId of problemIds) {
        const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);
        const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
        const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
        const historyFilePath = path.join(problemWorkspaceDir, 'history.json');
        const testResultFilePath = path.join(problemWorkspaceDir, 'test-result.json');

        try {
          await fs.access(codeFilePath);
          archive.file(codeFilePath, { name: `${problemId}/code.cpp` });
        } catch (e) {
          console.log(`Code file not found for ${problemId}, skipping.`);
        }

        try {
          await fs.access(audioFilePath);
          archive.file(audioFilePath, { name: `${problemId}/audio.webm` });
        } catch (e) {
          console.log(`Audio file not found for ${problemId}, skipping.`);
        }

        try {
          await fs.access(historyFilePath);
          archive.file(historyFilePath, { name: `${problemId}/history.json` });
        } catch (e) {
          console.log(`History file not found for ${problemId}, skipping.`);
        }

        try {
          await fs.access(testResultFilePath);
          archive.file(testResultFilePath, { name: `${problemId}/test-result.json` });
        } catch (e) {
          console.log(`Test result file not found for ${problemId}, skipping.`);
        }
      }

      await archive.finalize();

      return { success: true, filePath: saveResult.filePath };

    } catch (error: any) {
      console.error('Failed to export problems to zip:', error);
      return { success: false, message: error.message };
    }
  });
}