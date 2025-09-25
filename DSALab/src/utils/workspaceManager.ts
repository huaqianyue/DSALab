// src/utils/workspaceManager.ts
import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { AppSettings, ProblemLifecycleEvent } from '../types'; // 从 src/types 导入类型
import { getUserWorkspacesRoot, getAppSettingsPath } from './paths';

export function setupWorkspaceManager(ipcMain: Electron.IpcMain) {
  ipcMain.handle('read-problem-code', async (event, problemId: string): Promise<string | null> => {
    const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);
    const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
    try {
      const content = await fs.readFile(codeFilePath, 'utf-8');
      return content;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to read code for problem ${problemId}:`, error);
      }
      return null;
    }
  });

  ipcMain.handle('read-problem-audio', async (event, problemId: string): Promise<ArrayBuffer | null> => {
    const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);
    const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
    try {
      const buffer = await fs.readFile(audioFilePath);
      return buffer.buffer as ArrayBuffer;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to read audio for problem ${problemId}:`, error);
      }
      return null;
    }
  });

  ipcMain.handle('save-problem-workspace', async (event, problemId: string, codeContent: string, audioData: ArrayBuffer | null): Promise<boolean> => {
    const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);
    try {
      await fs.mkdir(problemWorkspaceDir, { recursive: true });

      const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
      await fs.writeFile(codeFilePath, codeContent, 'utf-8');

      const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
      if (audioData) {
        await fs.writeFile(audioFilePath, Buffer.from(audioData));
      } else {
        try {
          await fs.unlink(audioFilePath);
        } catch (e: any) {
          if (e.code !== 'ENOENT') {
            console.warn(`Could not delete audio file for problem ${problemId}:`, e);
          }
        }
      }

      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'problem_saved',
        codeSnapshot: codeContent,
        audioState: audioData ? 'present' : 'absent',
      } as ProblemLifecycleEvent);

      return true;
    } catch (error: any) {
      console.error(`Failed to save workspace for problem ${problemId}:`, error);
      return false;
    }
  });

  ipcMain.handle('load-app-settings', async (): Promise<AppSettings> => {
    const appSettingsPath = getAppSettingsPath();
    try {
      await fs.mkdir(path.dirname(appSettingsPath), { recursive: true });
      const settingsContent = await fs.readFile(appSettingsPath, 'utf-8');
      return JSON.parse(settingsContent);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('App settings file not found, returning default settings.');
      } else {
        console.error('Failed to load app settings:', error);
      }
      return { userName: '', studentId: '', lastOpenedProblemId: null };
    }
  });

  ipcMain.handle('save-app-settings', async (event, settings: AppSettings): Promise<boolean> => {
    const appSettingsPath = getAppSettingsPath();
    try {
      await fs.mkdir(path.dirname(appSettingsPath), { recursive: true });
      await fs.writeFile(appSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      return true;
    } catch (error: any) {
      console.error('Failed to save app settings:', error);
      return false;
    }
  });
}