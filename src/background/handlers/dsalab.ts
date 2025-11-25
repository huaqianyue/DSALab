import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as archiver from 'archiver';
import { createWriteStream } from 'fs';
import { getWebContents } from '../basicUtil';

// DSALab 相关类型定义
interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  Audio: string;
  Code: string;
  // 新增测试相关字段
  studentDebugTemplate?: string;
  judgeTemplate?: string;
  functionSignature?: string;
  testStatus?: 'passed' | 'failed' | 'not_tested';
  testScore?: number; // 测试分数 (0-100)
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

  // 获取问题测试结果文件路径
  static getProblemTestResultPath(problemId: string): string {
    return path.join(this.getProblemWorkspaceDir(problemId), 'test-result.json');
  }
}

// CDN 问题列表 URL（支持多个备用CDN）
const CDN_PROBLEMS_URLS = [
  'https://raw.githubusercontent.com/huaqianyue/DSALab/refs/heads/main/problem.json',
  'https://cdn.jsdmirror.cn/gh/huaqianyue/DSALab@main/problem.json',
  'https://cdn.jsdmirror.com/gh/huaqianyue/DSALab@main/problem.json'
  
];

// 历史记录缓冲区
const historyBuffers = new Map<string, {
  batchBuffer: HistoryEvent[];
  runEventsBuffer: HistoryEvent[];
  batchTimer: NodeJS.Timeout | null;
  lastEditEvent: HistoryEvent | null; // 用于字符合并
  lastEditTime: number; // 最后编辑时间
}>();

const HISTORY_FLUSH_BATCH_INTERVAL_MS = 20000; // 20秒
const CHARACTER_MERGE_INTERVAL_MS = 2000; // 2秒内的连续字符操作合并
const TYPE_MERGE_INTERVAL_MS = 10000; // 10秒内的type操作可以合并（只要没有其他操作打断）

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
  Audio?: string;
  Code?: string;
  // 新增测试模板字段
  studentDebugTemplate?: string;
  judgeTemplate?: string;
  functionSignature?: string;
  testStatus?: string;
  testScore?: number | string; // 兼容字符串格式
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
      Audio: raw.Audio || '',
      Code: raw.Code || '',
      studentDebugTemplate: raw.studentDebugTemplate || '',
      judgeTemplate: raw.judgeTemplate || '',
      functionSignature: raw.functionSignature || '',
      testStatus: (raw.testStatus as 'passed' | 'failed' | 'not_tested') || 'not_tested',
      testScore: typeof raw.testScore === 'number' ? raw.testScore : (typeof raw.testScore === 'string' ? parseInt(raw.testScore, 10) : undefined),
    };
  }
  return null;
}

// 按ID排序题目列表
function sortProblemsById(problems: Problem[]): Problem[] {
  return problems.sort((a, b) => a.id.localeCompare(b.id));
}

// 从单个CDN URL获取问题列表
async function fetchFromSingleCDN(cdnUrl: string): Promise<RawProblem[]> {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  const url = new URL(cdnUrl);
  const client = url.protocol === 'https:' ? https : http;
  
  const response = await new Promise<{ statusCode: number; statusMessage: string; data: string }>((resolve, reject) => {
    const req = client.request(url, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        data: data
      }));
    });
    
    req.on('error', (error: any) => reject(error));
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`HTTP error! status: ${response.statusCode} - ${response.statusMessage}`);
  }
  
  return JSON.parse(response.data);
}

// 从CDN获取问题列表（支持多个备用CDN自动重试）
async function fetchProblemsFromCDN(): Promise<RawProblem[]> {
  console.log('正在从CDN获取题目列表...');
  const errors: string[] = [];
  
  // 依次尝试每个CDN
  for (let i = 0; i < CDN_PROBLEMS_URLS.length; i++) {
    const cdnUrl = CDN_PROBLEMS_URLS[i];
    try {
      console.log(`📡 尝试 CDN ${i + 1}/${CDN_PROBLEMS_URLS.length}: ${cdnUrl}`);
      const cdnProblems = await fetchFromSingleCDN(cdnUrl);
      console.log(`✅ 从 CDN ${i + 1} 成功获取题目列表`);
      return cdnProblems;
    } catch (error: any) {
      const errorMsg = `CDN ${i + 1} 失败: ${error.message}`;
      console.warn(`⚠️ ${errorMsg}`);
      errors.push(errorMsg);
      // 如果不是最后一个CDN，继续尝试下一个
      if (i < CDN_PROBLEMS_URLS.length - 1) {
        console.log('🔄 尝试下一个备用 CDN...');
      }
    }
  }
  
  // 所有CDN都失败了
  const allErrors = errors.join('; ');
  console.error('❌ 所有CDN都获取失败:', allErrors);
  throw new Error(`所有CDN都获取失败: ${allErrors}`);
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
        // 保留本地的工作区数据
        Audio: existingLocal.Audio,
        Code: existingLocal.Code,
        // 保留本地的测试相关数据
        testStatus: existingLocal.testStatus,
        testScore: existingLocal.testScore,
        // 更新模板数据（如果CDN有更新）
        studentDebugTemplate: incomingProblem.studentDebugTemplate || existingLocal.studentDebugTemplate,
        judgeTemplate: incomingProblem.judgeTemplate || existingLocal.judgeTemplate,
        functionSignature: incomingProblem.functionSignature || existingLocal.functionSignature,
      });
      localMap.delete(id);
    } else {
      finalProblemsMap.set(id, {
        ...incomingProblem,
        Audio: '',
        Code: '',
        // 为新问题设置默认的测试相关字段
        testStatus: 'not_tested',
        testScore: undefined,
      });
    }
  }

  // 保留本地题目
  for (const [id, localProblem] of localMap.entries()) {
    finalProblemsMap.set(id, { ...localProblem });
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

// IPC 处理器注册 - 优化：立即返回本地题目，后台异步加载CDN
ipcMain.handle('dsalab-get-problems', async (event): Promise<Problem[]> => {
  await ensureDirectoryExists(path.dirname(DSALabPaths.getLocalProblemsJsonPath()));
  await ensureDirectoryExists(DSALabPaths.getUserWorkspacesRoot());

  // 立即加载并返回本地题目
  const localProblems: Problem[] = await loadPureLocalProblems();
  
  // 在后台异步加载 CDN，不阻塞返回
  (async () => {
    try {
      console.log('🌐 开始后台加载 CDN 题目...');
      // 通知前端开始自动获取题目
      getWebContents().send('ng:dsalab/cdn-loading' as any);
      
      const cdnProblems = await fetchProblemsFromCDN();
      
      // 重新加载最新的本地题目（可能用户已经修改）
      const currentLocalProblems = await loadPureLocalProblems();
      const mergedProblems = mergeProblemLists(currentLocalProblems, cdnProblems, true);

      await saveProblemsToFile(mergedProblems);
      
      console.log('✅ CDN 题目加载成功，通知前端刷新');
      // 通知前端 CDN 加载完成，自动刷新题目列表
      getWebContents().send('ng:dsalab/cdn-loaded' as any, mergedProblems);
    } catch (cdnError) {
      console.warn('⚠️ 后台 CDN 加载失败，前端继续使用本地题目:', cdnError);
      // 通知前端加载失败
      getWebContents().send('ng:dsalab/cdn-failed' as any);
    }
  })();

  // 立即返回本地题目，不等待 CDN
  return localProblems;
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

    // 获取问题列表以提取测试分数
    const problems = await loadPureLocalProblems();
    const selectedProblems = problems.filter(p => problemIds.includes(p.id));
    
    // 验证并修复文件名
    let sanitizedFileName = defaultFileName;
    if (!sanitizedFileName || sanitizedFileName.trim() === '' || sanitizedFileName.startsWith('_') || sanitizedFileName === '.zip') {
      const date = new Date();
      const timestamp = date.toISOString().replace(/[:.]/g, '-').substring(0, 19);
      sanitizedFileName = `DSALab_Export_${timestamp}.zip`;
    }
    
    // 生成包含测试分数的文件名
    let enhancedFileName = sanitizedFileName;
    if (selectedProblems.length > 0) {
      const testScores = selectedProblems
        .map(p => {
          const score = (p as any).testScore;
          if (score !== undefined && score !== null && score !== '') {
            return String(score).replace(/[/\\:*?"<>|]/g, '_'); // 替换所有无效文件名字符
          } else {
            return 'NA'; // 使用 NA 而不是 N/A
          }
        })
        .join('_');
      
      // 在文件名中插入测试分数（在时间戳之前）
      const nameWithoutExt = defaultFileName.replace('.zip', '');
      
      // 查找时间戳模式：YYYYMMDD_HHMMSS 或 YYMMDD_HHMMSS
      const timestampPattern = /_(\d{8}_\d{6})$/;
      const match = nameWithoutExt.match(timestampPattern);
      
      if (match) {
        const timestamp = match[1];
        const baseName = nameWithoutExt.replace(timestampPattern, '');
        enhancedFileName = `${baseName}_${testScores}_${timestamp}.zip`;
      } else {
        // 如果没有找到时间戳模式，直接在末尾添加分数
        enhancedFileName = `${nameWithoutExt}_${testScores}.zip`;
      }
    }

    // 添加调试日志
    console.log('🔍 Export Debug Info:');
    console.log('  - Original defaultFileName:', defaultFileName);
    console.log('  - Sanitized fileName:', sanitizedFileName);
    console.log('  - Enhanced fileName:', enhancedFileName);

    // 确保文件名以.zip结尾并清理无效字符
    let finalFileName = enhancedFileName.endsWith('.zip') ? enhancedFileName : `${enhancedFileName}.zip`;
    
    // 清理文件名中的所有无效字符
    finalFileName = finalFileName.replace(/[/\\:*?"<>|]/g, '_');
    
    // 构建完整的默认路径 - 使用用户的下载目录
    const os = require('os');
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    const fullDefaultPath = path.join(downloadsPath, finalFileName);
    
    console.log('  - Final fileName:', finalFileName);
    console.log('  - Full defaultPath:', fullDefaultPath);

    // 显示保存对话框，让用户选择 ZIP 文件保存位置
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fullDefaultPath,
      filters: [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: '导出为压缩包'
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, message: 'Export cancelled by user.' };
    }

    // 创建 ZIP 压缩包
    const output = createWriteStream(saveResult.filePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    // 设置错误处理
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

    // 将压缩包流连接到输出文件
    archive.pipe(output as any);

    // 添加问题文件到压缩包
    const workspacesRoot = DSALabPaths.getUserWorkspacesRoot();
    for (const problemId of problemIds) {
      const problemWorkspaceDir = path.join(workspacesRoot, problemId);
      const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
      const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
      const historyFilePath = path.join(problemWorkspaceDir, 'history.json');
      const testResultFilePath = path.join(problemWorkspaceDir, 'test-result.json');

      // 添加代码文件
      try {
        await fs.access(codeFilePath);
        archive.file(codeFilePath, { name: `${problemId}/code.cpp` });
        console.log(`Added code file for problem ${problemId}`);
      } catch (e) {
        console.log(`Code file not found for ${problemId}, skipping.`);
      }

      // 添加音频文件
      try {
        await fs.access(audioFilePath);
        archive.file(audioFilePath, { name: `${problemId}/audio.webm` });
        console.log(`Added audio file for problem ${problemId}`);
      } catch (e) {
        console.log(`Audio file not found for ${problemId}, skipping.`);
      }

      // 添加历史文件
      try {
        await fs.access(historyFilePath);
        archive.file(historyFilePath, { name: `${problemId}/history.json` });
        console.log(`Added history file for problem ${problemId}`);
      } catch (e) {
        console.log(`History file not found for ${problemId}, skipping.`);
      }

      // 添加测试结果文件
      try {
        await fs.access(testResultFilePath);
        archive.file(testResultFilePath, { name: `${problemId}/test-result.json` });
        console.log(`Added test result file for problem ${problemId}`);
      } catch (e) {
        console.log(`Test result file not found for ${problemId}, skipping.`);
      }
    }

    // 完成压缩包创建
    await archive.finalize();
    console.log(`Export completed: ${saveResult.filePath}`);

    return { success: true, filePath: saveResult.filePath };

  } catch (error: any) {
    console.error('Failed to export problems to zip:', error);
    return { 
      success: false, 
      message: error.message || 'Unknown error occurred during export' 
    };
  }
});

ipcMain.handle('dsalab-read-problem-code', async (event, problemId: string): Promise<string | null> => {
  const codeFilePath = DSALabPaths.getProblemCodePath(problemId);
  try {
    const content = await fs.readFile(codeFilePath, 'utf-8');
    return content;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 如果代码文件不存在，尝试使用调试模板
      const problems = await loadPureLocalProblems();
      const problem = problems.find(p => p.id === problemId);
      if (problem && problem.studentDebugTemplate) {
        console.log(`使用调试模板初始化问题${problemId}的代码`);
        return problem.studentDebugTemplate;
      }
    } else {
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
    
    // 如果代码内容为空且文件不存在，尝试使用调试模板初始化
    if (!codeContent || codeContent.trim() === '') {
      try {
        await fs.access(codeFilePath);
        // 文件存在但内容为空，保持为空
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // 文件不存在，使用调试模板初始化
          const problems = await loadPureLocalProblems();
          const problem = problems.find(p => p.id === problemId);
          if (problem && problem.studentDebugTemplate) {
            console.log(`使用调试模板初始化问题${problemId}的代码文件`);
            codeContent = problem.studentDebugTemplate;
          }
        }
      }
    }
    
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



// 检查两个编辑事件是否可以合并
function canMergeEditEvents(lastEvent: any, currentEvent: any): boolean {
  // 只合并相同操作类型的事件
  if (lastEvent.operationType !== currentEvent.operationType) {
    console.log(`🚫 不能合并: 操作类型不同 (${lastEvent.operationType} vs ${currentEvent.operationType})`);
    return false;
  }
  
  // 只合并 type 和 delete 操作，不合并undo_redo操作
  if (lastEvent.operationType !== 'type' && lastEvent.operationType !== 'delete') {
    console.log(`🚫 不能合并: 操作类型不支持合并 (${lastEvent.operationType})`);
    return false;
  }
  
  // undo_redo操作不应该被合并
  if (lastEvent.operationType === 'undo_redo' || currentEvent.operationType === 'undo_redo') {
    console.log(`🚫 不能合并: 包含undo_redo操作`);
    return false;
  }
  
  // 检查位置是否连续
  const lastRange = lastEvent.change.range;
  const currentRange = currentEvent.change.range;
  
  if (lastEvent.operationType === 'type') {
    // 对于输入操作，当前位置应该紧接着上次的结束位置
    const canMerge = (
      currentRange.startLineNumber === lastRange.endLineNumber &&
      currentRange.startColumn === lastRange.endColumn
    );
    if (!canMerge) {
      console.log(`🚫 type操作不能合并: 位置不连续 (上次结束: ${lastRange.endLineNumber}:${lastRange.endColumn}, 当前开始: ${currentRange.startLineNumber}:${currentRange.startColumn})`);
    } else {
      console.log(`✅ type操作可以合并: 位置连续`);
    }
    return canMerge;
  } else if (lastEvent.operationType === 'delete') {
    // 对于删除操作，当前删除位置应该紧接着上次删除的起始位置（向前删除）
    const canMerge = (
      currentRange.startLineNumber === lastRange.startLineNumber &&
      currentRange.endColumn === lastRange.startColumn
    );
    if (!canMerge) {
      console.log(`🚫 delete操作不能合并: 位置不连续 (上次开始: ${lastRange.startLineNumber}:${lastRange.startColumn}, 当前结束: ${currentRange.startLineNumber}:${currentRange.endColumn})`);
    } else {
      console.log(`✅ delete操作可以合并: 位置连续`);
    }
    return canMerge;
  }
  
  return false;
}

// 合并两个编辑事件
function mergeEditEvents(lastEvent: any, currentEvent: any): any {
  const mergedEvent = { ...lastEvent };
  
  if (lastEvent.operationType === 'type') {
    // 合并输入的文本
    const mergedText = lastEvent.change.text + currentEvent.change.text;
    mergedEvent.change = {
      ...lastEvent.change,
      text: mergedText,
      rangeLength: 0, // type操作的rangeLength应该是0
      range: {
        ...lastEvent.change.range,
        endLineNumber: currentEvent.change.range.endLineNumber,
        endColumn: currentEvent.change.range.endColumn
      }
    };
    console.log(`🔗 type操作合并详情: "${lastEvent.change.text}" + "${currentEvent.change.text}" = "${mergedText}"`);
  } else if (lastEvent.operationType === 'delete') {
    // 合并删除的长度，删除范围从当前事件开始到上次事件结束
    const mergedDeletedText = (currentEvent.change.deletedText || '') + (lastEvent.change.deletedText || '');
    const totalRangeLength = lastEvent.change.rangeLength + currentEvent.change.rangeLength;
    mergedEvent.change = {
      ...lastEvent.change,
      rangeLength: totalRangeLength,
      deletedText: mergedDeletedText || undefined,
      range: {
        ...currentEvent.change.range,  // 使用当前事件的起始位置
        endLineNumber: lastEvent.change.range.endLineNumber,
        endColumn: lastEvent.change.range.endColumn
      }
    };
    console.log(`🔗 delete操作合并详情: 删除"${currentEvent.change.deletedText || ''}" + "${lastEvent.change.deletedText || ''}" = "${mergedDeletedText}", 总长度: ${totalRangeLength}`);
  }
  
  // 更新时间戳为最新时间
  mergedEvent.timestamp = currentEvent.timestamp;
  // 更新光标位置为最新位置
  mergedEvent.cursorPosition = currentEvent.cursorPosition;
  
  return mergedEvent;
}

// 内部历史事件记录函数（增强版，支持字符合并）
function recordHistoryEventInternal(historyEvent: HistoryEvent): void {
  const { problemId, eventType } = historyEvent;

  if (!historyBuffers.has(problemId)) {
    historyBuffers.set(problemId, {
      batchBuffer: [],
      runEventsBuffer: [],
      batchTimer: null,
      lastEditEvent: null,
      lastEditTime: 0,
    });
  }
  const buffers = historyBuffers.get(problemId)!;

  switch (eventType) {
    case 'edit':
      // 处理字符合并逻辑
      const currentTime = Date.now();
      const editEvent = historyEvent as any;
      
      // 检查是否可以与上一个编辑事件合并
      const timeDiff = currentTime - buffers.lastEditTime;
      
      // 为type操作使用更宽松的时间限制
      const mergeTimeLimit = editEvent.operationType === 'type' ? TYPE_MERGE_INTERVAL_MS : CHARACTER_MERGE_INTERVAL_MS;
      
      const canMerge = buffers.lastEditEvent && 
          buffers.lastEditTime > 0 &&
          timeDiff <= mergeTimeLimit &&
          canMergeEditEvents(buffers.lastEditEvent as any, editEvent);
          
      console.log(`📝 编辑事件分析: 类型=${editEvent.operationType}, 文本="${editEvent.change.text}", 时间差=${timeDiff}ms, 时间限制=${mergeTimeLimit}ms, 可合并=${canMerge}`);
      
      if (canMerge) {
        
        // 合并事件
        const mergedEvent = mergeEditEvents(buffers.lastEditEvent as any, editEvent);
        
        // 替换缓冲区中的最后一个编辑事件
        let lastIndex = -1;
        for (let i = buffers.batchBuffer.length - 1; i >= 0; i--) {
          const e = buffers.batchBuffer[i];
          if (e.eventType === 'edit' && 
              e.problemId === problemId &&
              e === buffers.lastEditEvent) {
            lastIndex = i;
            break;
          }
        }
        
        if (lastIndex !== -1) {
          buffers.batchBuffer[lastIndex] = mergedEvent;
        } else {
          buffers.batchBuffer.push(mergedEvent);
        }
        
        // 合并日志在mergeEditEvents函数中已经输出，这里不重复
        
        buffers.lastEditEvent = mergedEvent;
        buffers.lastEditTime = currentTime;
      } else {
        // 不能合并，添加新事件
        buffers.batchBuffer.push(historyEvent);
        buffers.lastEditEvent = historyEvent;
        buffers.lastEditTime = currentTime;
        
        console.log(`📝 新编辑事件: ${editEvent.operationType} - "${editEvent.change.text}"`);
      }
      
      if (buffers.batchTimer) {
        clearTimeout(buffers.batchTimer);
      }
      buffers.batchTimer = setTimeout(() => flushHistoryBuffer(problemId, 'batch'), HISTORY_FLUSH_BATCH_INTERVAL_MS) as any;
      break;

    case 'run_start':
      buffers.runEventsBuffer.length = 0;
      buffers.batchBuffer.push(historyEvent);
      // 清除编辑缓存，因为运行开始是一个重要的分界点
      buffers.lastEditEvent = null;
      buffers.lastEditTime = 0;
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
      // 程序运行结束也要清除编辑缓存
      buffers.lastEditEvent = null;
      buffers.lastEditTime = 0;
      flushHistoryBuffer(problemId, 'batch');
      break;

    case 'problem_loaded':
    case 'problem_saved':
    case 'problem_switched':
    case 'audio_record_start':
    case 'audio_record_stop':
    case 'audio_play':
    case 'test_start':
    case 'test_completed':
    case 'test_failed':
      buffers.batchBuffer.push(historyEvent);
      // 这些重要事件也要清除编辑缓存
      buffers.lastEditEvent = null;
      buffers.lastEditTime = 0;
      flushHistoryBuffer(problemId, 'batch');
      break;

    // 调试相关事件
    case 'debug_button_clicked':
    case 'debug_start':
    case 'debug_exit':
    case 'debug_step':
    case 'debug_program_stopped':
    case 'debug_program_exited':
    case 'breakpoint_add':
    case 'breakpoint_remove':
      // 这些重要的调试事件立即刷新
      buffers.batchBuffer.push(historyEvent);
      buffers.lastEditEvent = null;
      buffers.lastEditTime = 0;
      flushHistoryBuffer(problemId, 'batch');
      break;

    case 'breakpoint_condition_change':
    case 'debug_console_output':
    case 'debug_program_running':
    case 'debug_expr_eval':
    case 'debug_command_sent':
      // 这些调试事件批量刷新
      buffers.batchBuffer.push(historyEvent);
      if (buffers.batchTimer) {
        clearTimeout(buffers.batchTimer);
      }
      buffers.batchTimer = setTimeout(() => flushHistoryBuffer(problemId, 'batch'), HISTORY_FLUSH_BATCH_INTERVAL_MS) as any;
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

// 加载应用设置
ipcMain.handle('dsalab-load-settings', async (): Promise<DSALabSettings> => {
  try {
    const settingsPath = DSALabPaths.getAppSettingsPath();
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const settingsContent = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as DSALabSettings;
    console.log('📋 DSALab settings loaded from file:', settings);
    return settings;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('📋 DSALab settings file not found, returning default settings');
    } else {
      console.error('❌ Failed to load DSALab settings:', error);
    }
    return { userName: '', studentId: '', lastOpenedProblemId: null };
  }
});

// 保存应用设置
ipcMain.handle('dsalab-save-settings', async (event, settings: DSALabSettings): Promise<void> => {
  try {
    const settingsPath = DSALabPaths.getAppSettingsPath();
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('💾 DSALab settings saved to file:', settings);
  } catch (error: any) {
    console.error('❌ Failed to save DSALab settings:', error);
    throw error;
  }
});

// 函数提取器
class CppFunctionExtractor {
  /*
  extractStudentFunction(sourceCode: string, functionSignature: string) {
    // 旧的函数提取逻辑，暂时保留注释
  }
  */

  extractClassDefinition(sourceCode: string, classSignature: string): {
    success: boolean;
    extractedCode: string;
    error?: string;
  } {
    try {
      // 支持 "class Solution" 或直接传类名
      const classNameMatch = classSignature.match(/class\s+(\w+)/);
      const fallbackName = classSignature.trim();
      const className = classNameMatch?.[1] || (fallbackName ? fallbackName : 'Solution');

      const classStartPattern = new RegExp(`class\\s+${className}\\s*\\{`, 'g');
      const classStartIndex = sourceCode.search(classStartPattern);

      if (classStartIndex === -1) {
        return {
          success: false,
          extractedCode: '',
          error: `未找到类: ${className}`
        };
      }

      let braceCount = 0;
      let classEndIndex = classStartIndex;
      let inClass = false;

      for (let i = classStartIndex; i < sourceCode.length; i++) {
        const char = sourceCode[i];

        if (char === '{') {
          braceCount++;
          inClass = true;
        } else if (char === '}') {
          braceCount--;
          if (inClass && braceCount === 0) {
            classEndIndex = i + 1;
            break;
          }
        }
      }

      if (braceCount !== 0) {
        return {
          success: false,
          extractedCode: '',
          error: `类 ${className} 的括号不匹配`
        };
      }

      // 包含可能存在的尾部分号
      while (classEndIndex < sourceCode.length && /\s/.test(sourceCode[classEndIndex])) {
        classEndIndex++;
      }
      if (sourceCode[classEndIndex] === ';') {
        classEndIndex++;
      }

      const extractedCode = sourceCode.substring(classStartIndex, classEndIndex);

      return {
        success: true,
        extractedCode
      };
    } catch (error: any) {
      return {
        success: false,
        extractedCode: '',
        error: `代码解析失败: ${error.message}`
      };
    }
  }
}

// 编译并运行判题器
async function compileAndRunJudge(problemId: string, judgeCode: string): Promise<{
  success: boolean;
  output: string;
  error: string;
}> {
  const tempDir = DSALabPaths.getTempCppDir();
  const sourceFile = path.join(tempDir, `${problemId}_judge.cpp`);
  const executableFile = path.join(tempDir, `${problemId}_judge.exe`);
  
  try {
    await ensureDirectoryExists(tempDir);
    await fs.writeFile(sourceFile, judgeCode, 'utf-8');
    
    // 获取MinGW路径并使用完整的g++路径
    const { getMingwPath } = require('../basicUtil');
    const mingwPath = getMingwPath();
    const gxxPath = path.join(mingwPath, 'bin', 'g++.exe');
    
    // 检查编译器是否存在
    if (!require('fs').existsSync(gxxPath)) {
      return {
        success: false,
        output: '',
        error: `编译器不存在: ${gxxPath}\n请检查MinGW安装路径是否正确`
      };
    }
    
    // 编译
    const { exec } = require('child_process');
    const compileCommand = `"${gxxPath}" "${sourceFile}" -o "${executableFile}" -static-libgcc -static-libstdc++`;
    
    console.log('测试编译命令:', compileCommand);
    
    return new Promise((resolve) => {
      exec(compileCommand, { 
        timeout: 10000,
        env: {
          ...process.env,
          Path: process.env.Path + path.delimiter + path.join(mingwPath, 'bin')
        }
      }, (compileError: any, compileStdout: string, compileStderr: string) => {
        if (compileError) {
          resolve({
            success: false,
            output: '',
            error: `编译失败: ${compileStderr || compileStdout || compileError.message}`
          });
          return;
        }
        
        // 运行
        exec(`"${executableFile}"`, { timeout: 5000 }, (runError: any, runStdout: string, runStderr: string) => {
          resolve({
            success: true,
            output: runStdout || '',
            error: runStderr || ''
          });
        });
      });
    });
    
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: `执行失败: ${error.message}`
    };
  }
}

// 解析测试结果
function parseTestResult(output: string): {
  passed: boolean;
  score: number;
  passedTests: number;
  totalTests: number;
  details: string;
} {
  const resultMatch = output.match(/\[RESULT\]\s*(\d+)\/(\d+)\s*tests passed/);
  const scoreMatch = output.match(/\[SCORE\]\s*(\d+)/);
  
  const passedTests = resultMatch ? parseInt(resultMatch[1]) : 0;
  const totalTests = resultMatch ? parseInt(resultMatch[2]) : 0;
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  const passed = passedTests === totalTests && totalTests > 0;
  
  return {
    passed,
    score,
    passedTests,
    totalTests,
    details: output
  };
}

// 更新问题测试状态
async function updateProblemTestStatus(problemId: string, status: 'passed' | 'failed' | 'not_tested', score?: number): Promise<void> {
  try {
    const problems = await loadPureLocalProblems();
    const problemIndex = problems.findIndex(p => p.id === problemId);
    
    if (problemIndex !== -1) {
      problems[problemIndex].testStatus = status;
      if (score !== undefined) {
        problems[problemIndex].testScore = score;
      }
      await saveProblemsToFile(problems);
    }
  } catch (error: any) {
    console.error(`更新测试状态失败:`, error);
  }
}

// 保存测试结果到文件
async function saveTestResultToFile(problemId: string, testResult: any): Promise<void> {
  try {
    const testResultPath = DSALabPaths.getProblemTestResultPath(problemId);
    const testResultDir = path.dirname(testResultPath);
    await ensureDirectoryExists(testResultDir);
    await fs.writeFile(testResultPath, JSON.stringify(testResult, null, 2), 'utf-8');
    console.log(`测试结果已保存到: ${testResultPath}`);
  } catch (error: any) {
    console.error(`保存测试结果失败:`, error);
  }
}

// 读取测试结果文件
async function loadTestResultFromFile(problemId: string): Promise<any | null> {
  try {
    const testResultPath = DSALabPaths.getProblemTestResultPath(problemId);
    const content = await fs.readFile(testResultPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error(`读取测试结果失败:`, error);
    }
    return null;
  }
}

// 运行测试的IPC处理器
ipcMain.handle('dsalab-run-test', async (event, problemId: string) => {
  try {
    // 1. 获取问题配置
    const problems = await loadPureLocalProblems();
    const problem = problems.find(p => p.id === problemId);
    
    if (!problem || !problem.judgeTemplate) {
      return { 
        success: false, 
        error: '该题目未配置测试模板' 
      };
    }
    
    // 2. 读取学生代码
    const studentCodePath = DSALabPaths.getProblemCodePath(problemId);
    let studentCode: string;
    
    try {
      studentCode = await fs.readFile(studentCodePath, 'utf-8');
    } catch (error: any) {
      return { 
        success: false, 
        error: '未找到学生代码文件' 
      };
    }
    
    // 3. 提取学生类
    const extractor = new CppFunctionExtractor();
    const classSignature = problem.functionSignature || 'class Solution';
    const extractResult = extractor.extractClassDefinition(studentCode, classSignature);
    
    if (!extractResult.success) {
      return { 
        success: false, 
        error: `类提取失败: ${extractResult.error}` 
      };
    }
    
    // 4. 生成完整测试代码
    const fullJudgeCode = problem.judgeTemplate.replace('{{STUDENT_CODE}}', extractResult.extractedCode);
    
    // 5. 编译并运行判题器
    const runResult = await compileAndRunJudge(problemId, fullJudgeCode);
    
    if (!runResult.success) {
      await updateProblemTestStatus(problemId, 'failed', 0);
      return { 
        success: false, 
        error: runResult.error 
      };
    }
    
    // 6. 解析测试结果
    const testResult = parseTestResult(runResult.output);
    
    // 7. 更新测试状态和分数
    await updateProblemTestStatus(problemId, testResult.passed ? 'passed' : 'failed', testResult.score);
    
    // 8. 保存测试结果到文件
    await saveTestResultToFile(problemId, {
      success: true,
      passed: testResult.passed,
      score: testResult.score,
      passedTests: testResult.passedTests,
      totalTests: testResult.totalTests,
      details: testResult.details,
      output: runResult.output,
      timestamp: Date.now()
    });
    
    // 历史事件由前端记录，这里不重复记录
    
    return {
      success: true,
      passed: testResult.passed,
      score: testResult.score,
      passedTests: testResult.passedTests,
      totalTests: testResult.totalTests,
      details: testResult.details,
      output: runResult.output
    };
    
  } catch (error: any) {
    await updateProblemTestStatus(problemId, 'failed');
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 读取测试结果的IPC处理器
ipcMain.handle('dsalab-read-test-result', async (event, problemId: string) => {
  try {
    const testResult = await loadTestResultFromFile(problemId);
    return testResult;
  } catch (error: any) {
    console.error(`读取测试结果失败:`, error);
    return null;
  }
});

console.log('DSALab handlers registered');

