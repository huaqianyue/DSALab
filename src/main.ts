// main.ts
import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { Buffer } from 'node:buffer';


if (started) {
  app.quit();
}

const createWindow = () => {

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


let cppProcess: ChildProcessWithoutNullStreams | null = null; // 用于跟踪当前正在运行的C++进程

// ----------------------------------------------------
// 新增：历史记录相关类型定义和 IPC 处理
// ----------------------------------------------------

// Shared HistoryEvent interfaces
interface HistoryEventBase {
  timestamp: number;
  problemId: string;
  eventType: string; // e.g., 'edit', 'run_start', 'run_end', 'program_output'
}

interface SimplifiedContentChange {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  rangeLength: number;
  text: string;
  rangeOffset: number;
}

interface CodeEditEvent extends HistoryEventBase {
  eventType: 'edit';
  operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'other_edit';
  change: SimplifiedContentChange;
  cursorPosition: { lineNumber: number; column: number };
}

interface ProgramRunStartEvent extends HistoryEventBase {
  eventType: 'run_start';
  codeSnapshot: string; // Full code at the moment of run
}

interface ProgramOutputEvent extends HistoryEventBase {
  eventType: 'program_output' | 'program_error' | 'user_input';
  data: string;
  outputType: 'log' | 'error' | 'user-input' | 'info' | 'result'; // Corresponds to cpp-output-chunk types
}

interface ProgramRunEndEvent extends HistoryEventBase {
  eventType: 'run_end' | 'compile_error' | 'run_timeout' | 'program_terminated_by_new_run';
  success: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs?: number; // Time taken for execution
  errorMessage?: string; // For compile_error, run_timeout, or general run_end error
}

interface ProblemLifecycleEvent extends HistoryEventBase {
  eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched';
  codeSnapshot?: string; // Code at load/save/switch
  audioState?: 'present' | 'absent' | 'modified'; // Audio state at save
}

interface AudioEvent extends HistoryEventBase {
  eventType: 'audio_record_start' | 'audio_record_stop' | 'audio_play';
  durationMs?: number; // For record_stop, play
  audioSizeKB?: number; // For record_stop
}

type HistoryEvent = CodeEditEvent | ProgramRunStartEvent | ProgramOutputEvent | ProgramRunEndEvent | ProblemLifecycleEvent | AudioEvent;

const HISTORY_FLUSH_BATCH_INTERVAL_MS = 30000; // 30 seconds for batch events

// Buffers for history events, per problemId
const historyBuffers: Map<string, {
  batchBuffer: HistoryEvent[];
  runEventsBuffer: HistoryEvent[];
  batchTimer: NodeJS.Timeout | null;
}> = new Map();

// Helper to get history file path for a problem
function getProblemHistoryFilePath(problemId: string): string {
  const problemWorkspaceDir = path.join(USER_WORKSPACES_ROOT, problemId);
  return path.join(problemWorkspaceDir, 'history.json');
}

// Function to flush events from a buffer to disk
async function flushBuffer(problemId: string, bufferType: 'batch' | 'run'): Promise<void> {
  const buffers = historyBuffers.get(problemId);
  if (!buffers) return;

  const bufferToFlush = bufferType === 'batch' ? buffers.batchBuffer : buffers.runEventsBuffer;

  if (bufferToFlush.length === 0) {
    return;
  }

  // Clear timer if flushing batch buffer
  if (bufferType === 'batch' && buffers.batchTimer) {
    clearTimeout(buffers.batchTimer);
    buffers.batchTimer = null;
  }

  const historyFilePath = getProblemHistoryFilePath(problemId);
  const problemWorkspaceDir = path.join(USER_WORKSPACES_ROOT, problemId);

  try {
    await fs.mkdir(problemWorkspaceDir, { recursive: true });

    let existingHistory: HistoryEvent[] = [];
    try {
      const content = await fs.readFile(historyFilePath, 'utf-8');
      existingHistory = JSON.parse(content);
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.error(`Failed to read history.json for problem ${problemId}:`, readError);
      }
    }

    const newHistory = existingHistory.concat(bufferToFlush);
    await fs.writeFile(historyFilePath, JSON.stringify(newHistory, null, 2), 'utf-8');
    console.log(`History for problem ${problemId} flushed (${bufferToFlush.length} events) from ${bufferType} buffer to ${historyFilePath}`);

    // Clear the buffer after successful write
    if (bufferType === 'batch') {
      buffers.batchBuffer.length = 0;
    } else {
      buffers.runEventsBuffer.length = 0;
    }

  } catch (error: any) {
    console.error(`Failed to flush history for problem ${problemId}:`, error);
  }
}

// IPC handler for history events
ipcMain.on('record-history-event', async (event, historyEvent: HistoryEvent) => {
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
      buffers.batchTimer = setTimeout(() => flushBuffer(problemId, 'batch'), HISTORY_FLUSH_BATCH_INTERVAL_MS);
      break;

    case 'run_start':
      buffers.runEventsBuffer.length = 0; // Clear run buffer for new run
      buffers.batchBuffer.push(historyEvent);
      await flushBuffer(problemId, 'batch'); // Immediately flush run_start with code snapshot
      break;

    case 'program_output':
    case 'program_error':
    case 'user_input':
      buffers.runEventsBuffer.push(historyEvent);
      break;

    case 'run_end':
    case 'compile_error':
    case 'run_timeout':
    case 'program_terminated_by_new_run': // Added this event type for history
      buffers.runEventsBuffer.push(historyEvent); // Add the end event itself
      buffers.batchBuffer.push(...buffers.runEventsBuffer); // Move all run events to batch buffer
      buffers.runEventsBuffer.length = 0; // Clear run buffer
      await flushBuffer(problemId, 'batch'); // Immediately flush the whole run cycle
      break;

    case 'problem_loaded':
    case 'problem_saved':
    case 'problem_switched':
    case 'audio_record_start':
    case 'audio_record_stop':
    case 'audio_play':
      buffers.batchBuffer.push(historyEvent);
      await flushBuffer(problemId, 'batch'); // Immediately flush important events
      break;

    default:
      console.warn(`Unknown history event type: ${eventType}`);
      break;
  }
});

// ----------------------------------------------------
// 修改：compile-and-run-cpp IPC 处理
// ----------------------------------------------------
ipcMain.handle('compile-and-run-cpp', async (event, problemId: string, code: string, timeout: number) => { // Added problemId
  const webContents = event.sender;
  const tempDir = path.join(app.getPath('temp'), 'DSALab-cpp');
  const sourceFilePath = path.join(tempDir, 'main.cpp');
  const executablePath = path.join(tempDir, process.platform === 'win32' ? 'main.exe' : 'main');

  // 如果有C++进程正在运行，先终止它
  if (cppProcess) {
    cppProcess.kill('SIGKILL');
    cppProcess = null;
    webContents.send('cpp-output-chunk', { type: 'error', data: '上一个程序被强制终止。\n' });
    // 记录：上一个程序被新程序强制终止
    ipcMain.emit('record-history-event', null, {
      timestamp: Date.now(),
      problemId: problemId,
      eventType: 'program_terminated_by_new_run',
      success: false,
      exitCode: null,
      signal: 'SIGKILL',
      errorMessage: 'Previous program was forcefully terminated by a new run.',
    } as ProgramRunEndEvent);
  }

  let finalOutput = ''; // 收集所有标准输出
  let finalError = '';  // 收集所有错误输出
  let compilationSuccess = false;
  const overallStartTime = Date.now(); // 记录整个运行过程的开始时间

  // 记录 run_start 事件
  ipcMain.emit('record-history-event', null, {
    timestamp: overallStartTime,
    problemId: problemId,
    eventType: 'run_start',
    codeSnapshot: code,
  } as ProgramRunStartEvent);


  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(sourceFilePath, code);

    // 1. 编译 C++ 代码
    webContents.send('cpp-output-chunk', { type: 'info', data: '正在编译C++代码...\n' });
    const compileCommand = `g++ "${sourceFilePath}" -o "${executablePath}"`;
    const compileStartTime = Date.now();
    const { stdout: compileStdout, stderr: compileStderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(compileCommand, { timeout: 10000 }, (err, stdout, stderr) => { // 编译超时10秒
        const compileDuration = Date.now() - compileStartTime;
        if (err) {
          // 检查是否是 g++ 命令未找到的错误
          if (err.message.includes('command not found') || err.message.includes('不是内部或外部命令')) {
            dialog.showErrorBox(
              '编译环境错误',
              `无法找到 g++ 编译器。请确保您的系统已安装 g++ 并且其路径已添加到环境变量 (PATH) 中。详细错误: ${err.message}`
            );
            // 记录编译错误事件
            ipcMain.emit('record-history-event', null, {
              timestamp: Date.now(),
              problemId: problemId,
              eventType: 'compile_error',
              success: false,
              exitCode: err.code || 1,
              signal: err.signal || null,
              durationMs: compileDuration,
              errorMessage: `g++ compiler not found or not in PATH. ${stderr || stdout || err.message}`,
            } as ProgramRunEndEvent);
            reject(new Error(`Compilation failed: g++ compiler not found or not in PATH. ${stderr || stdout || err.message}`));
          } else {
            // 记录编译错误事件
            ipcMain.emit('record-history-event', null, {
              timestamp: Date.now(),
              problemId: problemId,
              eventType: 'compile_error',
              success: false,
              exitCode: err.code || 1,
              signal: err.signal || null,
              durationMs: compileDuration,
              errorMessage: stderr || stdout || err.message,
            } as ProgramRunEndEvent);
            reject(new Error(`Compilation failed: ${stderr || stdout || err.message}`));
          }
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    if (compileStderr) {
      finalError += `[编译错误]\n${compileStderr}\n`;
      webContents.send('cpp-output-chunk', { type: 'error', data: finalError });
      // 编译错误事件已在上面 emit，此处直接返回
      return { success: false, output: finalOutput, error: finalError };
    }
    if (compileStdout) {
      finalOutput += `[编译输出]\n${compileStdout}\n`;
      webContents.send('cpp-output-chunk', { type: 'log', data: finalOutput });
      // 记录编译输出事件
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'program_output',
        data: `[编译输出]\n${compileStdout}\n`,
        outputType: 'log',
      } as ProgramOutputEvent);
    }
    compilationSuccess = true;
    webContents.send('cpp-output-chunk', { type: 'info', data: '编译成功，正在运行...\n' });

    // 2. 使用 spawn 执行编译后的程序，以便进行交互
    cppProcess = spawn(executablePath, []); // 不在这里设置超时，手动管理

    const executionStartTime = Date.now();
    const executionTimeoutId = setTimeout(() => {
      if (cppProcess && !cppProcess.killed) {
        cppProcess.kill('SIGKILL');
        finalError += `Execution timed out after ${timeout / 1000} seconds.\n`;
        webContents.send('cpp-output-chunk', { type: 'error', data: `⚠️ 执行超时：你的程序运行时间过长，可能存在无限循环或性能问题 (超过 ${timeout / 1000} 秒)。\n` });
        // 记录执行超时事件
        ipcMain.emit('record-history-event', null, {
          timestamp: Date.now(),
          problemId: problemId,
          eventType: 'run_timeout',
          success: false,
          exitCode: null,
          signal: 'SIGKILL',
          durationMs: Date.now() - executionStartTime,
          errorMessage: `Execution timed out after ${timeout / 1000} seconds.`,
        } as ProgramRunEndEvent);
      }
    }, timeout);

    // 监听子进程的标准输出
    cppProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      finalOutput += chunk;
      webContents.send('cpp-output-chunk', { type: 'log', data: chunk });
      // 记录程序标准输出事件
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'program_output',
        data: chunk,
        outputType: 'log',
      } as ProgramOutputEvent);
    });

    // 监听子进程的错误输出
    cppProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      finalError += chunk;
      webContents.send('cpp-output-chunk', { type: 'error', data: chunk });
      // 记录程序错误输出事件
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'program_error',
        data: chunk,
        outputType: 'error',
      } as ProgramOutputEvent);
    });

    // 处理子进程退出
    const { code: exitCode, signal } = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
      cppProcess?.on('close', (code, signal) => {
        resolve({ code, signal });
      });
      cppProcess?.on('error', (err) => { // 处理如可执行文件未找到等错误
        if (err.message.includes('ENOENT')) {
          finalError += `错误：无法找到可执行文件。请确保编译成功。\n`;
          webContents.send('cpp-output-chunk', { type: 'error', data: finalError });
          // 记录程序执行错误事件
          ipcMain.emit('record-history-event', null, {
            timestamp: Date.now(),
            problemId: problemId,
            eventType: 'run_end',
            success: false,
            exitCode: 1,
            signal: null,
            durationMs: Date.now() - executionStartTime,
            errorMessage: `Executable not found: ${err.message}`,
          } as ProgramRunEndEvent);
          resolve({ code: 1, signal: null });
        } else {
          finalError += `程序执行错误: ${err.message}\n`;
          webContents.send('cpp-output-chunk', { type: 'error', data: finalError });
          // 记录程序执行错误事件
          ipcMain.emit('record-history-event', null, {
            timestamp: Date.now(),
            problemId: problemId,
            eventType: 'run_end',
            success: false,
            exitCode: 1,
            signal: null,
            durationMs: Date.now() - executionStartTime,
            errorMessage: `Program execution error: ${err.message}`,
          } as ProgramRunEndEvent);
          resolve({ code: 1, signal: null });
        }
      });
    });

    clearTimeout(executionTimeoutId); // 如果进程正常退出，清除超时计时器

    const runDuration = Date.now() - executionStartTime;
    if (signal === 'SIGKILL') {
      // 超时或被强制终止的消息已由超时处理器或主动终止发送，对应的历史事件也已记录
      return { success: false, output: finalOutput, error: finalError };
    } else if (exitCode !== 0) {
      finalError += `程序以非零状态码 ${exitCode} 退出。\n`;
      webContents.send('cpp-output-chunk', { type: 'error', data: `程序以非零状态码 ${exitCode} 退出。\n` });
      // 记录程序非零状态码退出事件
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'run_end',
        success: false,
        exitCode: exitCode,
        signal: signal,
        durationMs: runDuration,
        errorMessage: `Program exited with non-zero status code ${exitCode}.`,
      } as ProgramRunEndEvent);
      return { success: false, output: finalOutput, error: finalError };
    } else {
      if (!finalOutput && !finalError) {
        webContents.send('cpp-output-chunk', { type: 'result', data: '代码执行完成，无输出。\n' });
      }
      // 记录程序正常退出事件
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'run_end',
        success: true,
        exitCode: 0,
        signal: null,
        durationMs: runDuration,
      } as ProgramRunEndEvent);
    }

    return { success: true, output: finalOutput, error: finalError };

  } catch (e: any) {
    finalError += `❌ 错误: ${e.message}\n`;
    webContents.send('cpp-output-chunk', { type: 'error', data: `❌ 错误: ${e.message}\n` });
    // 记录主进程层面错误事件 (如 exec/spawn 失败)
    ipcMain.emit('record-history-event', null, {
      timestamp: Date.now(),
      problemId: problemId,
      eventType: 'run_end', // General error
      success: false,
      exitCode: 1,
      signal: null,
      durationMs: Date.now() - overallStartTime, // Use overall start time for total duration
      errorMessage: `Main process error during compilation/execution setup: ${e.message}`,
    } as ProgramRunEndEvent);
    return { success: false, output: finalOutput, error: finalError };
  } finally {
    cppProcess = null; // 进程结束后清除引用
    // 清理临时文件
    try {
      await fs.unlink(sourceFilePath).catch(() => {}); // 忽略文件不存在的错误
      await fs.unlink(executablePath).catch(() => {}); // 忽略文件不存在的错误
    } catch (e) {
      console.error('Failed to clean up temporary files:', e);
    }
  }
});

// ----------------------------------------------------
// 修改：send-user-input IPC 处理
// ----------------------------------------------------
// 新增：用于接收渲染进程发送的用户输入
ipcMain.on('send-user-input', (event, problemId: string, input: string) => { // Added problemId
  if (cppProcess && !cppProcess.killed && cppProcess.stdin.writable) {
    cppProcess.stdin.write(Buffer.from(input + '\n', 'utf8'));
    // 记录用户输入事件
    ipcMain.emit('record-history-event', null, {
      timestamp: Date.now(),
      problemId: problemId,
      eventType: 'user_input',
      data: input,
      outputType: 'user-input',
    } as ProgramOutputEvent);
  } else {
    event.sender.send('cpp-output-chunk', { type: 'error', data: '错误：没有正在运行的程序可以接收输入。\n' });
  }
});

// --- File Operations for renderer (using dialog) ---
ipcMain.handle('show-open-dialog', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return null;

  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'C++ Files', extensions: ['cpp', 'cxx', 'cc', 'c'] },
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


// --- 持久化相关 IPC 处理 ---

// 定义本地 problems.json 的路径
const LOCAL_PROBLEMS_JSON_PATH = path.join(app.getPath('userData'), 'DSALab', 'problems.json');
// 定义用户工作区根目录的路径
const USER_WORKSPACES_ROOT = path.join(app.getPath('documents'), 'DSALab Workspaces');
// CDN 上的原始 problems.json URL
const CDN_PROBLEMS_URL = 'https://raw.githubusercontent.com/huaqianyue/DSALab/refs/heads/main/problem.json';

// 新增：用户设置文件路径
const APP_SETTINGS_PATH = path.join(app.getPath('userData'), 'DSALab', 'settings.json');

interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  Audio: string; // 相对路径或空
  Code: string;  // 相对路径或空
}

// 新增：应用设置接口
interface AppSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}

/**
 * 初始化或加载本地的 problems.json 文件。
 * 每次打开应用时，都从网络中加载json，并合并到本地的json中。
 * 处理新增、更新，并保留本地对 Audio 和 Code 路径的修改。
 */
async function initializeLocalProblems(): Promise<Problem[]> {
  await fs.mkdir(path.dirname(LOCAL_PROBLEMS_JSON_PATH), { recursive: true });
  await fs.mkdir(USER_WORKSPACES_ROOT, { recursive: true });

  let localProblems: Problem[] = [];
  const localProblemsMap = new Map<string, Problem>();

  // 1. 尝试加载本地的 problems.json
  try {
    const localProblemsContent = await fs.readFile(LOCAL_PROBLEMS_JSON_PATH, 'utf-8');
    localProblems = JSON.parse(localProblemsContent);
    localProblems.forEach(p => localProblemsMap.set(p.id, p));
    console.log('Loaded existing local problems.');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('Local problems.json not found, will create from CDN if available.');
    } else {
      console.error('Failed to read local problems.json:', error);
      dialog.showErrorBox('加载题目失败', `无法读取本地题目列表文件。\n错误: ${error.message}`);
      // 如果读取本地文件失败，但不是文件不存在，我们仍然尝试从 CDN 加载
    }
  }

  let cdnProblems: Problem[] = [];
  // 2. 始终尝试从 CDN 获取最新的 problems.json
  try {
    console.log('Fetching problems from CDN...');
    const response = await fetch(CDN_PROBLEMS_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    cdnProblems = await response.json();
    console.log('Fetched problems from CDN.');
  } catch (cdnError) {
    console.error('Failed to fetch problems from CDN:', cdnError);
    dialog.showErrorBox('加载题目失败', `无法从CDN加载题目列表，请检查网络连接。\n错误: ${cdnError instanceof Error ? cdnError.message : String(cdnError)}`);
    // 如果 CDN 加载失败，直接返回当前已加载的本地题目（可能是空的）
    return localProblems;
  }

  // 3. 合并逻辑
  const mergedProblems: Problem[] = [];
  const processedLocalIds = new Set<string>(); // 用于追踪已经被 CDN 题目合并的本地题目ID

  // 遍历 CDN 题目，进行更新或新增
  for (const cdnProblem of cdnProblems) {
    const localProblem = localProblemsMap.get(cdnProblem.id);
    if (localProblem) {
      // 题目已存在于本地，进行更新，但保留本地的 Audio 和 Code 路径
      mergedProblems.push({
        id: cdnProblem.id,
        Title: cdnProblem.Title,
        shortDescription: cdnProblem.shortDescription,
        fullDescription: cdnProblem.fullDescription,
        Audio: localProblem.Audio || '', // 优先使用本地路径，如果本地没有则为空
        Code: localProblem.Code || ''    // 优先使用本地路径，如果本地没有则为空
      });
      processedLocalIds.add(localProblem.id);
    } else {
      // CDN 中有新题目，添加到合并列表，Audio 和 Code 路径初始化为空
      mergedProblems.push({
        id: cdnProblem.id,
        Title: cdnProblem.Title,
        shortDescription: cdnProblem.shortDescription,
        fullDescription: cdnProblem.fullDescription,
        Audio: '',
        Code: ''
      });
    }
  }

  // 4. 添加本地独有的题目（CDN 中不存在的）
  // 遍历原始本地题目列表，将那些未被 CDN 题目合并的题目添加进来
  localProblems.forEach(localProblem => {
    if (!processedLocalIds.has(localProblem.id)) {
      // 这个本地题目没有在 CDN 列表中找到，将其保留
      mergedProblems.push(localProblem);
    }
  });

  // 5. 将合并后的题目列表保存到本地
  try {
    await fs.writeFile(LOCAL_PROBLEMS_JSON_PATH, JSON.stringify(mergedProblems, null, 2), 'utf-8');
    console.log('Merged problems saved to local problems.json successfully.');
    return mergedProblems;
  } catch (saveError: any) {
    console.error('Failed to save merged problems to local:', saveError);
    dialog.showErrorBox('保存题目失败', `无法保存合并后的题目列表到本地文件。\n错误: ${saveError.message}`);
    // 如果保存合并后的文件失败，则返回原始的本地题目列表（或 CDN 失败时返回的列表）
    return localProblems;
  }
}

// IPC 处理：获取本地问题列表
ipcMain.handle('get-problems-from-local', async () => {
  return await initializeLocalProblems();
});

// IPC 处理：保存本地问题列表
ipcMain.handle('save-problems-to-local', async (event, problems: Problem[]) => {
  try {
    // 注意：这里的保存是直接覆盖，用于渲染进程主动保存整个 problems 列表
    await fs.writeFile(LOCAL_PROBLEMS_JSON_PATH, JSON.stringify(problems, null, 2), 'utf-8');
    console.log('Local problems.json saved successfully by renderer.');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save problems to local by renderer:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理：读取指定问题的代码文件
ipcMain.handle('read-problem-code', async (event, problemId: string): Promise<string | null> => {
  const problemWorkspaceDir = path.join(USER_WORKSPACES_ROOT, problemId);
  const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
  try {
    const content = await fs.readFile(codeFilePath, 'utf-8');
    return content;
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // 忽略文件不存在的错误
      console.error(`Failed to read code for problem ${problemId}:`, error);
    }
    return null;
  }
});

// IPC 处理：读取指定问题的音频文件
ipcMain.handle('read-problem-audio', async (event, problemId: string): Promise<ArrayBuffer | null> => {
  const problemWorkspaceDir = path.join(USER_WORKSPACES_ROOT, problemId);
  const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
  try {
    const buffer = await fs.readFile(audioFilePath);
    return buffer.buffer; // 返回 ArrayBuffer
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // 忽略文件不存在的错误
      console.error(`Failed to read audio for problem ${problemId}:`, error);
    }
    return null;
  }
});

// IPC 处理：保存指定问题的代码和音频文件
// 注意：audioData 现在是 ArrayBuffer | null
ipcMain.handle('save-problem-workspace', async (event, problemId: string, codeContent: string, audioData: ArrayBuffer | null): Promise<boolean> => {
  const problemWorkspaceDir = path.join(USER_WORKSPACES_ROOT, problemId);
  try {
    await fs.mkdir(problemWorkspaceDir, { recursive: true }); // 确保问题目录存在

    // 保存代码
    const codeFilePath = path.join(problemWorkspaceDir, 'code.cpp');
    await fs.writeFile(codeFilePath, codeContent, 'utf-8');

    // 保存音频
    const audioFilePath = path.join(problemWorkspaceDir, 'audio.webm');
    if (audioData) { // 检查 audioData 是否存在
      // 将 ArrayBuffer 转换为 Node.js 的 Buffer 进行写入
      await fs.writeFile(audioFilePath, Buffer.from(audioData));
    } else {
      // 如果 audioData 为 null，表示没有音频或被清除了，删除旧的音频文件（如果存在）
      try {
        await fs.unlink(audioFilePath);
      } catch (e: any) {
        if (e.code !== 'ENOENT') { // 忽略文件不存在的错误
          console.warn(`Could not delete audio file for problem ${problemId}:`, e);
        }
      }
    }

    // 记录 problem_saved 事件
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

// 新增：加载应用设置
ipcMain.handle('load-app-settings', async (): Promise<AppSettings> => {
  try {
    await fs.mkdir(path.dirname(APP_SETTINGS_PATH), { recursive: true });
    const settingsContent = await fs.readFile(APP_SETTINGS_PATH, 'utf-8');
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

// 新增：保存应用设置
ipcMain.handle('save-app-settings', async (event, settings: AppSettings): Promise<boolean> => {
  try {
    await fs.mkdir(path.dirname(APP_SETTINGS_PATH), { recursive: true });
    await fs.writeFile(APP_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error: any) {
    console.error('Failed to save app settings:', error);
    return false;
  }
});


// ----------------------------------------------------
// 修改：应用即将退出事件，强制刷新所有历史记录缓冲区
// ----------------------------------------------------
// 应用准备就绪时创建窗口
app.on('ready', createWindow);

// 监听所有窗口关闭事件
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 监听应用激活事件（macOS Dock 图标点击）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 监听应用即将退出事件，通知渲染进程保存数据
app.on('before-quit', async (event) => {
  const mainWindow = BrowserWindow.getAllWindows()[0]; // 假设只有一个主窗口
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    event.preventDefault(); // 阻止默认退出行为
    console.log('Main process: Sending app-before-quit to renderer...');
    mainWindow.webContents.send('app-before-quit');

    // 等待渲染进程的确认消息
    await new Promise<void>(resolve => {
      ipcMain.once('app-quit-acknowledged', async () => {
        console.log('Main process: Renderer acknowledged quit, proceeding to flush all history buffers.');
        // 强制刷新所有问题的所有历史事件缓冲区
        for (const problemId of historyBuffers.keys()) {
          await flushBuffer(problemId, 'batch');
          // 确保程序运行缓冲区也被清空，以防程序在退出前仍在运行
          await flushBuffer(problemId, 'run');
        }
        console.log('Main process: All history buffers flushed.');
        resolve();
      });
    });
  }
});