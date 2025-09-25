// src/utils/cppExecution.ts
import { ipcMain, app, dialog } from 'electron';
import { exec, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { ProgramRunStartEvent, ProgramRunEndEvent, ProgramOutputEvent } from '../types'; // 从 src/types 导入类型
import { cppProcess, setCppProcess } from './globals'; // 从 globals 导入共享进程变量
import { getTempCppDir } from './paths';

export function setupCppExecutionHandlers(ipcMain: Electron.IpcMain) {
  ipcMain.handle('compile-and-run-cpp', async (event, problemId: string, code: string, timeout: number) => {
    const webContents = event.sender;
    const tempDir = getTempCppDir();
    const sourceFilePath = path.join(tempDir, 'main.cpp');
    const executablePath = path.join(tempDir, process.platform === 'win32' ? 'main.exe' : 'main');

    if (cppProcess) {
      cppProcess.kill('SIGKILL');
      setCppProcess(null);
      webContents.send('cpp-output-chunk', { type: 'error', data: '上一个程序被强制终止。\n' });
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

    let finalOutput = '';
    let finalError = '';
    const overallStartTime = Date.now();

    ipcMain.emit('record-history-event', null, {
      timestamp: overallStartTime,
      problemId: problemId,
      eventType: 'run_start',
      codeSnapshot: code,
    } as ProgramRunStartEvent);

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(sourceFilePath, code);

      webContents.send('cpp-output-chunk', { type: 'info', data: '正在编译C++代码...\n' });
      const compileCommand = `g++ "${sourceFilePath}" -o "${executablePath}"`;
      const compileStartTime = Date.now();
      const { stdout: compileStdout, stderr: compileStderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
        exec(compileCommand, { timeout: 10000 }, (err, stdout, stderr) => {
          const compileDuration = Date.now() - compileStartTime;
          if (err) {
            if (err.message.includes('command not found') || err.message.includes('不是内部或外部命令')) {
              dialog.showErrorBox(
                '编译环境错误',
                `无法找到 g++ 编译器。请确保您的系统已安装 g++ 并且其路径已添加到环境变量 (PATH) 中。详细错误: ${err.message}`
              );
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
        return { success: false, output: finalOutput, error: finalError };
      }
      if (compileStdout) {
        finalOutput += `[编译输出]\n${compileStdout}\n`;
        webContents.send('cpp-output-chunk', { type: 'log', data: finalOutput });
        ipcMain.emit('record-history-event', null, {
          timestamp: Date.now(),
          problemId: problemId,
          eventType: 'program_output',
          data: `[编译输出]\n${compileStdout}\n`,
          outputType: 'log',
        } as ProgramOutputEvent);
      }
      webContents.send('cpp-output-chunk', { type: 'info', data: '编译成功，正在运行...\n' });

      setCppProcess(spawn(executablePath, []));

      const executionStartTime = Date.now();
      const executionTimeoutId = setTimeout(() => {
        if (cppProcess && !cppProcess.killed) {
          cppProcess.kill('SIGKILL');
          finalError += `Execution timed out after ${timeout / 1000} seconds.\n`;
          webContents.send('cpp-output-chunk', { type: 'error', data: `⚠️ 执行超时：你的程序运行时间过长，可能存在无限循环或性能问题 (超过 ${timeout / 1000} 秒)。\n` });
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

      cppProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        finalOutput += chunk;
        webContents.send('cpp-output-chunk', { type: 'log', data: chunk });
        ipcMain.emit('record-history-event', null, {
          timestamp: Date.now(),
          problemId: problemId,
          eventType: 'program_output',
          data: chunk,
          outputType: 'log',
        } as ProgramOutputEvent);
      });

      cppProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        finalError += chunk;
        webContents.send('cpp-output-chunk', { type: 'error', data: chunk });
        ipcMain.emit('record-history-event', null, {
          timestamp: Date.now(),
          problemId: problemId,
          eventType: 'program_error',
          data: chunk,
          outputType: 'error',
        } as ProgramOutputEvent);
      });

      const { code: exitCode, signal } = await new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve) => {
        cppProcess?.on('close', (code, signal) => {
          resolve({ code, signal });
        });
        cppProcess?.on('error', (err) => {
          if (err.message.includes('ENOENT')) {
            finalError += `错误：无法找到可执行文件。请确保编译成功。\n`;
            webContents.send('cpp-output-chunk', { type: 'error', data: finalError });
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

      clearTimeout(executionTimeoutId);

      const runDuration = Date.now() - executionStartTime;
      if (signal === 'SIGKILL') {
        return { success: false, output: finalOutput, error: finalError };
      } else if (exitCode !== 0) {
        finalError += `程序以非零状态码 ${exitCode} 退出。\n`;
        webContents.send('cpp-output-chunk', { type: 'error', data: `程序以非零状态码 ${exitCode} 退出。\n` });
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
      ipcMain.emit('record-history-event', null, {
        timestamp: Date.now(),
        problemId: problemId,
        eventType: 'run_end',
        success: false,
        exitCode: 1,
        signal: null,
        durationMs: Date.now() - overallStartTime,
        errorMessage: `Main process error during compilation/execution setup: ${e.message}`,
      } as ProgramRunEndEvent);
      return { success: false, output: finalOutput, error: finalError };
    } finally {
      setCppProcess(null);
      try {
        await fs.unlink(sourceFilePath).catch(() => {});
        await fs.unlink(executablePath).catch(() => {});
      } catch (e) {
        console.error('Failed to clean up temporary files:', e);
      }
    }
  });

  ipcMain.on('send-user-input', (event, problemId: string, input: string) => {
    if (cppProcess && !cppProcess.killed && cppProcess.stdin.writable) {
      cppProcess.stdin.write(Buffer.from(input + '\n', 'utf8'));
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
}