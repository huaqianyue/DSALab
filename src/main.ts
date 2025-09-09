// main.ts
import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron'; // 引入 ipcMain 和 dialog
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { exec, execFile } from 'node:child_process'; // 引入 exec 和 execFile
import { promises as fs } from 'node:fs'; // 引入 fs.promises

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
ipcMain.handle('compile-and-run-cpp', async (event, code: string, timeout: number) => {
  const tempDir = path.join(app.getPath('temp'), 'DSALab-cpp');
  const sourceFilePath = path.join(tempDir, 'main.cpp');
  const executablePath = path.join(tempDir, process.platform === 'win32' ? 'main.exe' : 'main');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(sourceFilePath, code);

    let output = '';
    let error = '';

    // 1. Compile C++ code
    const compileCommand = `g++ "${sourceFilePath}" -o "${executablePath}"`;
    const { stdout: compileStdout, stderr: compileStderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(compileCommand, { timeout: 10000 }, (err, stdout, stderr) => { // 10 seconds for compilation
        if (err) {
          reject(new Error(`Compilation failed: ${stderr || stdout || err.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    if (compileStderr) {
      error += `[编译错误]\n${compileStderr}\n`;
    }
    if (compileStdout) {
      output += `[编译输出]\n${compileStdout}\n`;
    }

    // 2. Execute compiled program
    const { stdout: runStdout, stderr: runStderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      // For execution, use execFile for better security and argument handling
      const child = execFile(executablePath, [], { timeout }, (err, stdout, stderr) => {
        if (err && err.killed) {
          reject(new Error(`Execution timed out after ${timeout / 1000} seconds.`));
        } else if (err) {
          reject(new Error(`Execution failed: ${stderr || stdout || err.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    if (runStderr) {
      error += `[运行时错误]\n${runStderr}\n`;
    }
    output += runStdout;

    return { success: true, output, error };

  } catch (e: any) {
    return { success: false, output: '', error: e.message };
  } finally {
    // Clean up temporary files
    try {
      await fs.unlink(sourceFilePath).catch(() => {}); // Ignore errors if file doesn't exist
      await fs.unlink(executablePath).catch(() => {}); // Ignore errors if file doesn't exist
      // Optionally, remove the tempDir if empty, but keeping it might be fine for debugging
      // await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
    } catch (e) {
      console.error('Failed to clean up temporary files:', e);
    }
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
  const content = await fs.readFile(filePath, 'utf-8');
  return { filePath, content };
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