import * as path from 'path';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import { execFile, spawn } from 'child_process';
import { extraResourcesPath, typedIpcMain, getWebContents, store, getMingwPath } from '../basicUtil';
import { GccDiagnostics, BuildResult } from '../ipcTyping';

// function encode(src: string) {
//   return encodeURIComponent(src);
// }

function changeExt(srcPath: string, ext: string) {
  return path.join(path.dirname(srcPath), path.parse(srcPath).name + ext);
}

function getExecutablePath(srcPath: string) {
  return path.join(path.dirname(srcPath), path.parse(srcPath).name + ".exe");
}

function isCompiled(srcPath: string): boolean {
  const exePath = getExecutablePath(srcPath);
  if (fs.existsSync(exePath)) {
    return fs.statSync(exePath).mtime > fs.statSync(srcPath).mtime;
  } else
    return false;
}

interface ExecCompilerResult {
  success: boolean,
  stderr: string
}

function parseDynamic(arg: string): string {
  if (arg.startsWith('DYN')) {
    const argval = arg.substr(3);
    if (argval === "-fexec-charset") {
      // -fexec-charset=GBK
      return argval + '=' + store.get('advanced.ioEncoding');
    } else throw new Error("unknown dynamic option");
  } else return arg;
}

async function execCompiler(srcPath: string, noLink: boolean, debugInfo: boolean): Promise<ExecCompilerResult> {
  let outputFileName: string;
  const cwd = path.dirname(srcPath);
  let args: string[];
  if (noLink) {
    outputFileName = path.basename(changeExt(srcPath, '.o'));
    args = [
      ...store.get('build.compileArgs').map(parseDynamic),
      ...(debugInfo ? ['-g'] : []),
      '-c',
      srcPath,
      '-o',
      outputFileName,
      '-fdiagnostics-format=json',
    ];
  } else {
    outputFileName = path.basename(getExecutablePath(srcPath));
    args = [
      ...store.get('build.compileArgs').map(parseDynamic),
      srcPath,
      '-o',
      outputFileName,
      '-static-libgcc',
      '-static-libstdc++',
    ];
  }
  return new Promise((resolve) => {
    const mingwPath = getMingwPath();
    const gxxPath = path.join(mingwPath, 'bin/g++.exe');
    if (!fs.existsSync(gxxPath)) {
      resolve({ success: false, stderr: `编译器 g++.exe 在路径下未找到: ${gxxPath}\n请检查MinGW安装路径是否正确` });
      return;
    }
    execFile(path.join(mingwPath, 'bin/g++.exe'), args, {
      cwd: cwd,
      encoding: 'buffer',
      env: {
        Path: process.env.Path + path.delimiter + path.join(mingwPath, 'bin')
      }
    }, (error, _, stderrBuf) => {
      const stderr = iconv.decode(stderrBuf, store.get('advanced.ioEncoding'));
      if (error) {
        resolve({
          success: false,
          stderr
        });
      } else {
        resolve({
          success: true,
          stderr
        });
      }
    });
  });
}



export async function doCompile(srcPath: string, debugInfo = false): Promise<BuildResult> {
  getWebContents().send('ng:build/buildStarted');
  //
  // generate .o
  const compileResult = await execCompiler(srcPath, true, debugInfo);
  let diagnostics: GccDiagnostics = [];
  
  // 检查是否是编译器不存在的情况
  if (!compileResult.success && compileResult.stderr.includes('编译器 g++.exe 在路径下未找到')) {
    return {
      success: false,
      stage: "compiler_not_found",
      diagnostics: [],
      what: {
        error: "编译器未找到",
        stderr: compileResult.stderr
      }
    };
  }
  
  try {
    diagnostics = JSON.parse(compileResult.stderr);
  } catch (e) {
    return {
      success: false,
      stage: "parse_error",
      diagnostics: diagnostics,
      what: {
        error: e,
        stderr: compileResult.stderr
      }
    };
  }
  if (!compileResult.success) {
    return {
      success: false,
      stage: "compile",
      diagnostics: diagnostics
    };
  }
  // generate .exe
  const linkResult = await execCompiler(changeExt(srcPath, '.o'), false, debugInfo);
  if (!linkResult.success) {
    return {
      success: false,
      stage: "link",
      linkerr: linkResult.stderr,
      diagnostics: diagnostics
    };
  } else {
    // remove .o
    fs.unlinkSync(changeExt(srcPath, '.o'));
    return {
      success: true,
      linkerr: linkResult.stderr,
      diagnostics: diagnostics,
      output: getExecutablePath(srcPath)
    };
  }
}

typedIpcMain.handle('build/build', async (_, arg) => {
  console.log("Receive build request. Compiling");
  const result = await doCompile(arg.path);
  console.log("Compilation finish. Returning value");
  getWebContents().send('ng:build/buildComplete', result);
});

// 保存当前运行的进程，用于取消运行
let currentRunningProcess: any = null;

typedIpcMain.handle('build/runExe', async (_, arg) => {
  console.log('运行请求 - 源文件路径:', arg.path);
  
  const exePath = getExecutablePath(arg.path);
  console.log('期望的exe路径:', exePath);
  console.log('exe文件是否存在:', fs.existsSync(exePath));
  
  // 如果 exe 不存在，或者源文件比 exe 新，则先编译
  if (!fs.existsSync(exePath) || 
      (fs.existsSync(arg.path) && fs.statSync(arg.path).mtime > fs.statSync(exePath).mtime)) {
    console.log('🔨 需要编译，开始编译...');
    const compileResult = await doCompile(arg.path);
    getWebContents().send('ng:build/buildComplete', compileResult);
    
    if (!compileResult.success) {
      console.warn('❌ 编译失败，取消运行');
      // 根据编译失败的原因提供更友好的错误消息
      let errorMessage = '编译失败';
      if (compileResult.stage === 'compiler_not_found') {
        errorMessage = '编译器未找到，请检查MinGW安装';
      } else if (compileResult.stage === 'parse_error') {
        errorMessage = '编译输出解析失败';
      } else if (compileResult.stage === 'compile') {
        errorMessage = '编译错误';
      } else if (compileResult.stage === 'link') {
        errorMessage = '链接错误';
      }
      
      // 编译失败，通知前端重置运行状态
      getWebContents().send('ng:program/error', {
        path: arg.path,
        error: errorMessage,
        durationMs: 0
      });
      return;
    }
    console.log('✅ 编译成功，准备运行');
  }
  
  const cpPath = path.join(extraResourcesPath, 'bin/ConsolePauser.exe');
  const startTime = Date.now();
  
  console.log('🚀 开始启动程序，ConsolePauser路径:', cpPath);
  console.log('🚀 可执行文件路径:', getExecutablePath(arg.path));
  
  // https://github.com/nodejs/node/issues/7367#issuecomment-229721296
  const result = spawn(JSON.stringify(cpPath), [
    getExecutablePath(arg.path)
  ], {
    detached: true,
    shell: true,
    cwd: path.dirname(arg.path)
  });
  
  // 保存当前进程
  currentRunningProcess = result;
  
  console.log('✅ 进程已启动，PID:', result.pid);
  
  result.on('error', (error) => {
    console.error('❌ Program execution error:', error);
    currentRunningProcess = null;
    // 通知前端程序运行错误（用于DSALab历史记录）
    getWebContents().send('ng:program/error', {
      path: arg.path,
      error: error.message,
      durationMs: Date.now() - startTime
    });
  });
  
  result.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    console.log('🏁 Exit event: Program exited with code:', code, 'signal:', signal);
    currentRunningProcess = null;
    // 通知前端程序运行结束（用于DSALab历史记录）
    getWebContents().send('ng:program/exit', {
      path: arg.path,
      exitCode: code,
      signal: signal,
      durationMs: Date.now() - startTime
    });
  });
  
  result.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    console.log('🔒 Close event: Program closed with code:', code, 'signal:', signal);
    // close 事件在所有 stdio 流关闭后触发，对 detached 进程更可靠
    if (currentRunningProcess) {
      currentRunningProcess = null;
      // 如果 exit 事件没有触发，用 close 事件作为后备
      getWebContents().send('ng:program/exit', {
        path: arg.path,
        exitCode: code,
        signal: signal,
        durationMs: Date.now() - startTime
      });
    }
  });
});

// 取消运行
typedIpcMain.handle('build/cancelRun' as any, async (_, arg) => {
  if (currentRunningProcess && currentRunningProcess.pid) {
    console.log('取消运行，终止进程树 PID:', currentRunningProcess.pid);
    
    try {
      // 在 Windows 上使用 taskkill 强制终止进程树
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec(`taskkill /pid ${currentRunningProcess.pid} /T /F`, (error) => {
          if (error) {
            console.error('taskkill 失败:', error);
          } else {
            console.log('✅ 进程树已终止');
          }
        });
      } else {
        // 非 Windows 平台使用 kill
        currentRunningProcess.kill('SIGKILL');
      }
      
      currentRunningProcess = null;
      return { success: true };
    } catch (error) {
      console.error('终止进程失败:', error);
      currentRunningProcess = null;
      return { success: false, message: '终止进程失败' };
    }
  }
  return { success: false, message: '没有正在运行的程序' };
});
