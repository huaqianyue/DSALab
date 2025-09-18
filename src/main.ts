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

ipcMain.handle('compile-and-run-cpp', async (event, code: string, timeout: number) => {
  const webContents = event.sender; // 获取 webContents 以便发送消息回渲染进程
  const tempDir = path.join(app.getPath('temp'), 'DSALab-cpp');
  const sourceFilePath = path.join(tempDir, 'main.cpp');
  const executablePath = path.join(tempDir, process.platform === 'win32' ? 'main.exe' : 'main');

  // 如果有C++进程正在运行，先终止它
  if (cppProcess) {
    cppProcess.kill('SIGKILL');
    cppProcess = null;
    webContents.send('cpp-output-chunk', { type: 'error', data: '上一个程序被强制终止。\n' });
  }

  let finalOutput = ''; // 收集所有标准输出
  let finalError = '';  // 收集所有错误输出
  let compilationSuccess = false;

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(sourceFilePath, code);

    // 1. 编译 C++ 代码
    webContents.send('cpp-output-chunk', { type: 'info', data: '正在编译C++代码...\n' });
    const compileCommand = `g++ "${sourceFilePath}" -o "${executablePath}"`;
    const { stdout: compileStdout, stderr: compileStderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(compileCommand, { timeout: 10000 }, (err, stdout, stderr) => { // 编译超时10秒
        if (err) {
          // 检查是否是 g++ 命令未找到的错误
          if (err.message.includes('command not found') || err.message.includes('不是内部或外部命令')) {
            dialog.showErrorBox(
              '编译环境错误',
              `无法找到 g++ 编译器。请确保您的系统已安装 g++ 并且其路径已添加到环境变量 (PATH) 中。详细错误: ${err.message}`
            );
            reject(new Error(`Compilation failed: g++ compiler not found or not in PATH. ${stderr || stdout || err.message}`));
          } else {
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
      return { success: false, output: finalOutput, error: finalError }; // 编译失败，提前返回
    }
    if (compileStdout) {
      finalOutput += `[编译输出]\n${compileStdout}\n`;
      webContents.send('cpp-output-chunk', { type: 'log', data: finalOutput });
    }
    compilationSuccess = true;
    webContents.send('cpp-output-chunk', { type: 'info', data: '编译成功，正在运行...\n' });

    // 2. 使用 spawn 执行编译后的程序，以便进行交互
    cppProcess = spawn(executablePath, []); // 不在这里设置超时，手动管理

    const executionTimeoutId = setTimeout(() => {
      if (cppProcess && !cppProcess.killed) {
        cppProcess.kill('SIGKILL');
        finalError += `Execution timed out after ${timeout / 1000} seconds.\n`;
        webContents.send('cpp-output-chunk', { type: 'error', data: `⚠️ 执行超时：你的程序运行时间过长，可能存在无限循环或性能问题 (超过 ${timeout / 1000} 秒)。\n` });
      }
    }, timeout);

    // 监听子进程的标准输出
    cppProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      finalOutput += chunk;
      webContents.send('cpp-output-chunk', { type: 'log', data: chunk });
    });

    // 监听子进程的错误输出
    cppProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      finalError += chunk;
      webContents.send('cpp-output-chunk', { type: 'error', data: chunk });
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
          resolve({ code: 1, signal: null });
        } else {
          finalError += `程序执行错误: ${err.message}\n`;
          webContents.send('cpp-output-chunk', { type: 'error', data: finalError });
          resolve({ code: 1, signal: null });
        }
      });
    });

    clearTimeout(executionTimeoutId); // 如果进程正常退出，清除超时计时器

    if (signal === 'SIGKILL') {
      // 超时或被强制终止的消息已由超时处理器或主动终止发送
      return { success: false, output: finalOutput, error: finalError };
    } else if (exitCode !== 0) {
      finalError += `程序以非零状态码 ${exitCode} 退出。\n`;
      webContents.send('cpp-output-chunk', { type: 'error', data: `程序以非零状态码 ${exitCode} 退出。\n` });
      return { success: false, output: finalOutput, error: finalError };
    } else if (!finalOutput && !finalError) {
      webContents.send('cpp-output-chunk', { type: 'result', data: '代码执行完成，无输出。\n' });
    }

    return { success: true, output: finalOutput, error: finalError };

  } catch (e: any) {
    finalError += `❌ 错误: ${e.message}\n`;
    webContents.send('cpp-output-chunk', { type: 'error', data: `❌ 错误: ${e.message}\n` });
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

// 新增：用于接收渲染进程发送的用户输入
ipcMain.on('send-user-input', (event, input: string) => {
  if (cppProcess && !cppProcess.killed && cppProcess.stdin.writable) {
    cppProcess.stdin.write(Buffer.from(input + '\n', 'utf8'));
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


app.on('ready', createWindow);


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
