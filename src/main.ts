// main.ts
import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { Buffer } from 'node:buffer'; // <--- 新增导入 Buffer

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
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
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Create application menu
  createMenu();

  return mainWindow;
};

const createMenu = () => {
  const isMac = process.platform === 'darwin';

  const template: any[] = [
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-new-file');
          }
        },
        {
          label: '打开...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-open-file');
          }
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-save-file');
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
          { role: 'delete', label: '删除' },
          { role: 'selectAll', label: '全选' },
          { type: 'separator' },
          {
            label: '语音',
            submenu: [
              { role: 'startSpeaking', label: '开始朗读' },
              { role: 'stopSpeaking', label: '停止朗读' }
            ]
          }
        ] : [
          { role: 'delete', label: '删除' },
          { type: 'separator' },
          { role: 'selectAll', label: '全选' }
        ])
      ]
    },
    {
      label: '代码',
      submenu: [
        {
          label: '运行',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-run-code');
          }
        },
        {
          label: '清空输出',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-clear-output');
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front', label: '前置所有窗口' },
          { type: 'separator' },
          { role: 'window', label: '窗口' }
        ] : [
          { role: 'close', label: '关闭' }
        ])
      ]
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: '关于 DSALab',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-about');
          }
        },
        {
          label: '了解更多',
          click: async () => {
            await shell.openExternal('https://github.com/FranciscoJBrito/WizardJS');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// --- C++ Compilation and Execution Logic ---
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
          reject(new Error(`Compilation failed: ${stderr || stdout || err.message}`));
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
    const { code: exitCode, signal } = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => { // <--- 重命名 code 为 exitCode，避免与参数 code 混淆 (虽然不是直接原因，但为了清晰)
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
    } else if (exitCode !== 0) { // <--- 使用 exitCode
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
    // <--- 解决第一个错误：将字符串转换为 Buffer
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
  // const content = await fs.readFile(filePath, 'utf-8'); // <--- 这是你原始的第 274 行附近
  const fileContent = await fs.readFile(filePath, 'utf-8'); // <--- 将 content 重命名为 fileContent，以防万一有隐式冲突（尽管不太可能）
  return { filePath, content: fileContent }; // <--- 返回时也使用 fileContent
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.