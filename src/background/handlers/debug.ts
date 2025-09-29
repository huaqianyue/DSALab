import { GdbController } from "@gytx/tsgdbmi";
import * as path from 'path';

import { doCompile } from './build';
import { getWebContents, getWindow, typedIpcMain, store, getMingwPath } from '../basicUtil';

const gdb = new GdbController('utf-8');
gdb.onResponse(response => {
  switch (response.type) {
    case "console":
      getWebContents().send('ng:debug/console', response);
      break;
    case "notify":
      getWebContents().send('ng:debug/notify', response);
      getWindow().focus();
      break;
    case "result":
      getWebContents().send('ng:debug/result', response);
      break;
    default:
      break;
  }
});
gdb.onClose(() => {
  getWebContents().send('ng:debug/debuggerStopped');
});
const gdbPath = path.join(getMingwPath(), 'bin/gdb.exe');
const startupCommand = [
  '-gdb-set new-console on',
  '-enable-pretty-printing'
];

typedIpcMain.handle('debug/start', async (_, arg) => {
  const result = await doCompile(arg.srcPath, true);
  getWebContents().send('ng:build/buildComplete', result);
  if (!result.success) {
    return {
      success: false,
      error: "Compilation failed."
    };
  }
  if (gdb.isRunning) {
    gdb.exit();
    // wait for a while
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 检查MinGW路径
  const mingwPath = getMingwPath();
  if (!mingwPath) {
    return {
      success: false,
      error: "MinGW path is not configured. Please set the MinGW path in settings."
    };
  }
  const gdbPath = path.join(mingwPath, 'bin/gdb.exe');
  const output = result.output;
  if (!output) {
    return {
      success: false,
      error: "No output path from compilation"
    };
  }
  const cwd = path.dirname(output);
  const filename = path.basename(output);
  gdb.launch(gdbPath, [filename], {
    cwd: cwd
  });
  try {
    for (const command of startupCommand) {
      const response = await gdb.sendRequest(command);
      if (!response || response.message === "error") {
        return {
          success: false,
          error: `Startup command '${command}' execution failed`
        };
      }
    }
  } catch (e) {
    return {
      success: false,
      error: e
    };
  }
  getWebContents().send('ng:debug/debuggerStarted');
  return {
    success: true
  };
});

typedIpcMain.handle('debug/exit', (_) => {
  if (!gdb.isRunning) {
    return;
  }
  gdb.exit();
});

typedIpcMain.handle('debug/sendRequest', (_, arg) => {
  if (!gdb.isRunning) {
    return {
      success: false,
      error: "GDB not started"
    };
  }
  try {
    console.log("request: " + arg.command);
    gdb.sendRequest(arg.command, false);
    return {
      success: true
    };
  } catch (e) {
    return {
      success: false,
      error: e
    };
  }
});
