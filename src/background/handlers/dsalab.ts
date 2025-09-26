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

import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
// import * as archiver from 'archiver';
import { createWriteStream } from 'fs';

// DSALab 相关类型定义
interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  isDelete: boolean;
  Audio: string;
  Code: string;
}

interface DSALabSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}

interface HistoryEvent {
  timestamp: number;
  problemId: string;
  eventType: string;
  [key: string]: any;
}

// DSALab 路径管理（与原始DSALab完全一致）
class DSALabPaths {
  private static userDataPath: string;
  private static documentsPath: string;

  static init() {
    this.userDataPath = app.getPath('userData');
    this.documentsPath = app.getPath('documents');
  }

  static getLocalProblemsJsonPath(): string {
    return path.join(this.userDataPath, 'DSALab', 'problems.json');
  }

  static getUserWorkspacesRoot(): string {
    return path.join(this.documentsPath, 'DSALab Workspaces');
  }

  static getAppSettingsPath(): string {
    return path.join(this.userDataPath, 'DSALab', 'settings.json');
  }

  static getTempCppDir(): string {
    return path.join(app.getPath('temp'), 'DSALab-cpp');
  }

  // 获取问题工作区目录
  static getProblemWorkspaceDir(problemId: string): string {
    return path.join(this.getUserWorkspacesRoot(), problemId);
  }

  // 获取问题代码文件路径
  static getProblemCodePath(problemId: string): string {
    return path.join(this.getProblemWorkspaceDir(problemId), 'code.cpp');
  }

  // 获取问题音频文件路径
  static getProblemAudioPath(problemId: string): string {
    return path.join(this.getProblemWorkspaceDir(problemId), 'audio.webm');
  }

  // 获取问题历史文件路径
  static getProblemHistoryPath(problemId: string): string {
    return path.join(this.getProblemWorkspaceDir(problemId), 'history.json');
  }
}

// CDN 问题列表 URL（与原始DSALab一致）
const CDN_PROBLEMS_URL = 'https://raw.githubusercontent.com/huaqianyue/DSALab/refs/heads/main/problem.json';

// 历史记录缓冲区
const historyBuffers = new Map<string, {
  batchBuffer: HistoryEvent[];
  runEventsBuffer: HistoryEvent[];
  batchTimer: NodeJS.Timeout | null;
}>();

const HISTORY_FLUSH_BATCH_INTERVAL_MS = 5000; // 5秒

// 初始化DSALab路径
DSALabPaths.init();

// 确保目录存在
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// 原始问题数据接口（兼容CDN格式）
interface RawProblem {
  id: string;
  shortDescription: string;
  fullDescription: string;
  isDelete?: string | boolean;
  Audio?: string;
  Code?: string;
}

// 转换原始问题数据为标准格式
function convertToProblem(raw: RawProblem): Problem | null {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    typeof raw.id === 'string' &&
    typeof raw.shortDescription === 'string' &&
    typeof raw.fullDescription === 'string'
  ) {
    return {
      id: raw.id,
      Title: raw.shortDescription,
      shortDescription: raw.shortDescription,
      fullDescription: raw.fullDescription,
      isDelete: raw.isDelete === true || raw.isDelete === 'true',
      Audio: raw.Audio || '',
      Code: raw.Code || '',
    };
  }
  return null;
}

// 按ID排序题目列表
function sortProblemsById(problems: Problem[]): Problem[] {
  return problems.sort((a, b) => a.id.localeCompare(b.id));
}

// 从CDN获取问题列表
async function fetchProblemsFromCDN(): Promise<RawProblem[]> {
  console.log('正在从CDN获取题目列表...');
  try {
    const response = await fetch(CDN_PROBLEMS_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }
    const cdnProblems = await response.json();
    console.log('从CDN成功获取题目列表');
    return cdnProblems;
  } catch (error: any) {
    console.error('从CDN获取题目失败:', error);
    // CDN获取失败时抛出错误，让调用方处理
    throw error;
  }
}

// 只读取本地problems.json（与原始DSALab一致）
async function loadPureLocalProblems(): Promise<Problem[]> {
  const localProblemsJsonPath = DSALabPaths.getLocalProblemsJsonPath();
  await ensureDirectoryExists(path.dirname(localProblemsJsonPath));
  try {
    const content = await fs.readFile(localProblemsJsonPath, 'utf-8');
    const rawLocalProblems: RawProblem[] = JSON.parse(content);
    const problems: Problem[] = [];
    rawLocalProblems.forEach(rawP => {
      const p = convertToProblem(rawP);
      if (p) {
        problems.push(p);
      }
    });
    console.log('成功读取本地problems.json');
    return sortProblemsById(problems);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('本地problems.json不存在，返回空列表');
    } else {
      console.error('读取本地problems.json失败:', error);
    }
    return [];
  }
}

// 保存问题列表到文件（与原始DSALab一致）
async function saveProblemsToFile(problems: Problem[]): Promise<void> {
  try {
    await fs.writeFile(DSALabPaths.getLocalProblemsJsonPath(), JSON.stringify(problems, null, 2), 'utf-8');
    console.log('问题列表已成功保存到本地problems.json');
  } catch (error: any) {
    console.error('保存问题列表到本地文件失败:', error);
    throw error;
  }
}

// 合并问题列表（与原始DSALab逻辑一致）
function mergeProblemLists(
  localProblems: Problem[],
  incomingProblemsRaw: RawProblem[],
  sourceIsCDN: boolean = true
): Problem[] {
  const localMap = new Map<string, Problem>();
  localProblems.forEach(p => localMap.set(p.id, { ...p }));

  const incomingMap = new Map<string, RawProblem>();
  incomingProblemsRaw.forEach(p => incomingMap.set(p.id, p));

  const finalProblemsMap = new Map<string, Problem>();

  for (const [id, incomingRaw] of incomingMap.entries()) {
    const incomingProblem = convertToProblem(incomingRaw);
    if (!incomingProblem) {
      console.warn(`跳过无效的问题数据: ${JSON.stringify(incomingRaw)}`);
      continue;
    }

    if (localMap.has(id)) {
      const existingLocal = localMap.get(id)!;
      finalProblemsMap.set(id, {
        ...existingLocal,
        shortDescription: incomingProblem.shortDescription,
        fullDescription: incomingProblem.fullDescription,
        Title: incomingProblem.shortDescription,
        isDelete: false,
      });
      localMap.delete(id);
    } else {
      finalProblemsMap.set(id, {
        ...incomingProblem,
        Audio: '',
        Code: '',
        isDelete: false,
      });
    }
  }

  for (const [id, localProblem] of localMap.entries()) {
    if (sourceIsCDN) {
      finalProblemsMap.set(id, { ...localProblem, isDelete: true });
    } else {
      finalProblemsMap.set(id, { ...localProblem });
    }
  }

  return sortProblemsById(Array.from(finalProblemsMap.values()));
}

// 历史记录管理（与原始DSALab完全一致）
async function flushHistoryBuffer(problemId: string, bufferType: 'batch' | 'run'): Promise<void> {
  const buffers = historyBuffers.get(problemId);
  if (!buffers) return;

  const bufferToFlush = bufferType === 'batch' ? buffers.batchBuffer : buffers.runEventsBuffer;

  if (bufferToFlush.length === 0) {
    return;
  }

  if (bufferType === 'batch' && buffers.batchTimer) {
    clearTimeout(buffers.batchTimer);
    buffers.batchTimer = null;
  }

  const historyFilePath = DSALabPaths.getProblemHistoryPath(problemId);
  const problemWorkspaceDir = DSALabPaths.getProblemWorkspaceDir(problemId);

  try {
    await ensureDirectoryExists(problemWorkspaceDir);

    let existingHistory: HistoryEvent[] = [];
    try {
      const content = await fs.readFile(historyFilePath, 'utf-8');
      existingHistory = JSON.parse(content);
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.error(`读取问题${problemId}的history.json失败:`, readError);
      }
    }

    const newHistory = existingHistory.concat(bufferToFlush);
    await fs.writeFile(historyFilePath, JSON.stringify(newHistory, null, 2), 'utf-8');
    console.log(`问题${problemId}的历史记录已刷新（${bufferToFlush.length}个事件）从${bufferType}缓冲区到${historyFilePath}`);

    if (bufferType === 'batch') {
      buffers.batchBuffer.length = 0;
    } else {
      buffers.runEventsBuffer.length = 0;
    }

  } catch (error: any) {
    console.error(`刷新问题${problemId}的历史记录失败:`, error);
  }
}

// 刷新所有历史记录缓冲区
async function flushAllHistoryBuffers(): Promise<void> {
  for (const problemId of historyBuffers.keys()) {
    await flushHistoryBuffer(problemId, 'batch');
    await flushHistoryBuffer(problemId, 'run');
  }
}

// IPC 处理器注册（与原始DSALab完全一致）
ipcMain.handle('dsalab-get-problems', async (event): Promise<Problem[]> => {
  await ensureDirectoryExists(path.dirname(DSALabPaths.getLocalProblemsJsonPath()));
  await ensureDirectoryExists(DSALabPaths.getUserWorkspacesRoot());

  let localProblems: Problem[] = await loadPureLocalProblems();
  let cdnProblems: RawProblem[] = [];

  try {
    cdnProblems = await fetchProblemsFromCDN();
  } catch (cdnError) {
    console.warn('CDN获取失败，仅返回本地问题');
    return localProblems;
  }

  const mergedProblems = mergeProblemLists(localProblems, cdnProblems, true);

  try {
    await saveProblemsToFile(mergedProblems);
    return mergedProblems;
  } catch (saveError: any) {
    console.error('初始加载时保存合并问题到本地失败:', saveError);
    return mergedProblems;
  }
});

ipcMain.handle('dsalab-refresh-problems', async (event): Promise<Problem[]> => {
  await ensureDirectoryExists(path.dirname(DSALabPaths.getLocalProblemsJsonPath()));
  await ensureDirectoryExists(DSALabPaths.getUserWorkspacesRoot());

  const localProblems: Problem[] = await loadPureLocalProblems();

  let cdnProblems: RawProblem[];
  try {
    cdnProblems = await fetchProblemsFromCDN();
    // CDN获取成功，合并CDN和本地问题
    const mergedProblems = mergeProblemLists(localProblems, cdnProblems, true);
    
    try {
      await saveProblemsToFile(mergedProblems);
      return mergedProblems;
    } catch (saveError: any) {
      console.error('保存刷新后的问题到本地失败:', saveError);
      return mergedProblems;
    }
  } catch (error) {
    console.warn('CDN获取失败，返回本地问题列表:', error);
    // CDN获取失败，直接返回本地问题
    return localProblems;
  }

});

ipcMain.handle('dsalab-import-problems', async (event, jsonContent: string) => {
  try {
    const importedRaw: RawProblem[] = JSON.parse(jsonContent);
    if (!Array.isArray(importedRaw)) {
      throw new Error('导入的JSON不是数组格式');
    }

    const validImportedProblemsRaw: RawProblem[] = [];
    let invalidProblemCount = 0;

    for (const item of importedRaw) {
      if (convertToProblem(item)) {
        validImportedProblemsRaw.push(item);
      } else {
        invalidProblemCount++;
      }
    }

    if (validImportedProblemsRaw.length === 0 && importedRaw.length > 0) {
        throw new Error('导入的JSON文件中没有找到有效的问题');
    }

    const currentLocalProblems = await loadPureLocalProblems();

    const mergedProblems = mergeProblemLists(currentLocalProblems, validImportedProblemsRaw, false);

    await saveProblemsToFile(mergedProblems);
    console.log(`导入问题已合并并保存。${validImportedProblemsRaw.length}个有效问题已添加/更新，${invalidProblemCount}个无效问题已跳过`);
    return { success: true, problems: mergedProblems, invalidCount: invalidProblemCount };

  } catch (error: any) {
    console.error('导入问题失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dsalab-export-problems', async (event, problemIds: string[], defaultFileName: string) => {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) throw new Error('No focused window');

    // 暂时简化导出功能，选择一个目录来保存文件
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择导出目录'
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, message: 'Export cancelled' };
    }

    const exportDir = result.filePaths[0];
    const exportPath = path.join(exportDir, defaultFileName.replace('.zip', ''));

    // 创建导出目录
    await ensureDirectoryExists(exportPath);

    // 复制问题文件
    const workspacesRoot = DSALabPaths.getUserWorkspacesRoot();
    for (const problemId of problemIds) {
      const problemDir = path.join(workspacesRoot, problemId);
      const targetDir = path.join(exportPath, problemId);
      
      try {
        await ensureDirectoryExists(targetDir);
        
        // 复制代码文件
        const codeFile = path.join(problemDir, 'code.cpp');
        const targetCodeFile = path.join(targetDir, 'code.cpp');
        try {
          await fs.copyFile(codeFile, targetCodeFile);
        } catch (e) {
          // 文件不存在，跳过
        }

        // 复制音频文件
        const audioFile = path.join(problemDir, 'audio.webm');
        const targetAudioFile = path.join(targetDir, 'audio.webm');
        try {
          await fs.copyFile(audioFile, targetAudioFile);
        } catch (e) {
          // 文件不存在，跳过
        }

        // 复制历史文件
        const historyFile = path.join(problemDir, 'history.json');
        const targetHistoryFile = path.join(targetDir, 'history.json');
        try {
          await fs.copyFile(historyFile, targetHistoryFile);
        } catch (e) {
          // 文件不存在，跳过
        }
      } catch (error) {
        console.error(`Failed to export problem ${problemId}:`, error);
      }
    }

    return { success: true, filePath: exportPath };
  } catch (error) {
    console.error('Failed to export problems:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('dsalab-read-problem-code', async (event, problemId: string): Promise<string | null> => {
  const codeFilePath = DSALabPaths.getProblemCodePath(problemId);
  try {
    const content = await fs.readFile(codeFilePath, 'utf-8');
    return content;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`读取问题${problemId}的代码失败:`, error);
    }
    return null;
  }
});

ipcMain.handle('dsalab-read-problem-audio', async (event, problemId: string): Promise<ArrayBuffer | null> => {
  const audioFilePath = DSALabPaths.getProblemAudioPath(problemId);
  try {
    const buffer = await fs.readFile(audioFilePath);
    console.log(`Read audio file for ${problemId}: ${buffer.length} bytes from ${audioFilePath}`);
    return buffer.buffer as ArrayBuffer;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`读取问题${problemId}的音频失败:`, error);
    } else {
      console.log(`Audio file not found for ${problemId}: ${audioFilePath}`);
    }
    return null;
  }
});



ipcMain.handle('dsalab-save-problem-workspace', async (event, problemId: string, codeContent: string, audioData: ArrayBuffer | null): Promise<boolean> => {
  const problemWorkspaceDir = DSALabPaths.getProblemWorkspaceDir(problemId);
  try {
    await ensureDirectoryExists(problemWorkspaceDir);

    const codeFilePath = DSALabPaths.getProblemCodePath(problemId);
    await fs.writeFile(codeFilePath, codeContent, 'utf-8');

    const audioFilePath = DSALabPaths.getProblemAudioPath(problemId);
    if (audioData) {
      await fs.writeFile(audioFilePath, Buffer.from(audioData));
    } else {
      try {
        await fs.unlink(audioFilePath);
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          console.warn(`无法删除问题${problemId}的音频文件:`, e);
        }
      }
    }

    // 记录历史事件（与原始DSALab一致）
    const historyEvent: HistoryEvent = {
      timestamp: Date.now(),
      problemId: problemId,
      eventType: 'problem_saved',
      codeSnapshot: codeContent,
      audioState: audioData ? 'present' : 'absent',
    };
    
    // 发送历史事件到历史管理器
    recordHistoryEventInternal(historyEvent);

    return true;
  } catch (error: any) {
    console.error(`保存问题${problemId}的工作区失败:`, error);
    return false;
  }
});

ipcMain.handle('dsalab-load-settings', async (): Promise<DSALabSettings> => {
  const appSettingsPath = DSALabPaths.getAppSettingsPath();
  try {
    await ensureDirectoryExists(path.dirname(appSettingsPath));
    const settingsContent = await fs.readFile(appSettingsPath, 'utf-8');
    return JSON.parse(settingsContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('应用设置文件不存在，返回默认设置');
    } else {
      console.error('加载应用设置失败:', error);
    }
    return { userName: '', studentId: '', lastOpenedProblemId: null };
  }
});

ipcMain.handle('dsalab-save-settings', async (event, settings: DSALabSettings): Promise<boolean> => {
  const appSettingsPath = DSALabPaths.getAppSettingsPath();
  try {
    await ensureDirectoryExists(path.dirname(appSettingsPath));
    await fs.writeFile(appSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error: any) {
    console.error('保存应用设置失败:', error);
    return false;
  }
});

// 内部历史事件记录函数（与原始DSALab完全一致）
function recordHistoryEventInternal(historyEvent: HistoryEvent): void {
  const { problemId, eventType } = historyEvent;

  if (!historyBuffers.has(problemId)) {
    historyBuffers.set(problemId, {
      batchBuffer: [],
      runEventsBuffer: [],
      batchTimer: null,
    });
  }
  const buffers = historyBuffers.get(problemId)!;

  switch (eventType) {
    case 'edit':
      buffers.batchBuffer.push(historyEvent);
      if (buffers.batchTimer) {
        clearTimeout(buffers.batchTimer);
      }
      buffers.batchTimer = setTimeout(() => flushHistoryBuffer(problemId, 'batch'), HISTORY_FLUSH_BATCH_INTERVAL_MS) as any;
      break;

    case 'run_start':
      buffers.runEventsBuffer.length = 0;
      buffers.batchBuffer.push(historyEvent);
      flushHistoryBuffer(problemId, 'batch');
      break;

    case 'program_output':
    case 'program_error':
    case 'user_input':
      buffers.runEventsBuffer.push(historyEvent);
      break;

    case 'run_end':
    case 'compile_error':
    case 'run_timeout':
    case 'program_terminated_by_new_run':
      buffers.runEventsBuffer.push(historyEvent);
      buffers.batchBuffer.push(...buffers.runEventsBuffer);
      buffers.runEventsBuffer.length = 0;
      flushHistoryBuffer(problemId, 'batch');
      break;

    case 'problem_loaded':
    case 'problem_saved':
    case 'problem_switched':
    case 'audio_record_start':
    case 'audio_record_stop':
    case 'audio_play':
      buffers.batchBuffer.push(historyEvent);
      flushHistoryBuffer(problemId, 'batch');
      break;

    default:
      console.warn(`未知的历史事件类型: ${eventType}`);
      break;
  }
}

ipcMain.on('dsalab-record-history', (event, historyEvent: HistoryEvent) => {
  recordHistoryEventInternal(historyEvent);
});

// 应用退出时刷新所有缓冲区（与原始DSALab一致）
app.on('before-quit', async () => {
  await flushAllHistoryBuffers();
  historyBuffers.forEach((bufferData) => {
    if (bufferData.batchTimer) {
      clearTimeout(bufferData.batchTimer);
    }
  });
});

// 添加文件打开处理器
ipcMain.handle('file/openFile', async (event, filters?: any[]) => {
  try {
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow) throw new Error('No focused window');

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      filePath: filePath,
      content: content
    };
  } catch (error) {
    console.error('Failed to open file:', error);
    return null;
  }
});

// 添加保存问题列表处理器（与原始DSALab一致）
ipcMain.handle('dsalab-save-problems-to-local', async (event, problems: Problem[]) => {
  try {
    const sortedProblems = sortProblemsById(problems);
    await saveProblemsToFile(sortedProblems);
    console.log('本地problems.json已由渲染器成功保存');
    return { success: true };
  } catch (error: any) {
    console.error('渲染器保存问题到本地失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取纯本地问题列表（不合并CDN）
ipcMain.handle('dsalab-get-pure-local-problems', async (): Promise<Problem[]> => {
  return await loadPureLocalProblems();
});

// 读取纯本地问题列表（别名）
ipcMain.handle('dsalab-read-pure-local-problems', async (): Promise<Problem[]> => {
  return await loadPureLocalProblems();
});

// 获取工作区根路径
ipcMain.handle('dsalab-get-workspace-root', async () => {
  return DSALabPaths.getUserWorkspacesRoot();
});

console.log('DSALab handlers registered');

