// main.ts
import { app, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

// 导入工具函数和设置模块
import { initPaths } from './utils/paths';
import { createWindow, setupAppLifecycleHandlers } from './utils/appLifecycle';
import { setupHistoryManager } from './utils/historyManager';
import { setupCppExecutionHandlers } from './utils/cppExecution';
import { setupFileDialogHandlers } from './utils/fileDialogs';
import { setupProblemManager } from './utils/problemManager';
import { setupWorkspaceManager } from './utils/workspaceManager';
import { setupExportManager } from './utils/exportManager';

// Electron Squirrel Startup (用于 Windows 安装程序)
if (started) {
  app.quit();
}

// 应用准备就绪时执行
app.on('ready', () => {
  // 初始化路径常量（需要app对象）
  initPaths();

  // 创建主窗口
  createWindow();

  // 设置所有 IPC 处理器
  setupHistoryManager(ipcMain);
  setupCppExecutionHandlers(ipcMain);
  setupFileDialogHandlers(ipcMain);
  setupProblemManager(ipcMain);
  setupWorkspaceManager(ipcMain);
  setupExportManager(ipcMain);

  // 设置应用生命周期事件监听器
  setupAppLifecycleHandlers();
});