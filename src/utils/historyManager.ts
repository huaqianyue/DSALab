// src/utils/historyManager.ts
import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HistoryEvent, ProgramRunEndEvent, ProgramOutputEvent, ProblemLifecycleEvent, AudioEvent, CodeEditEvent, ProgramRunStartEvent } from '../types'; // 从 src/types 导入类型
import { getUserWorkspacesRoot } from './paths';
import { historyBuffers, HISTORY_FLUSH_BATCH_INTERVAL_MS } from './globals'; // 从 globals 导入共享缓冲区和常量

// Helper to get history file path for a problem
function getProblemHistoryFilePath(problemId: string): string {
  const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);
  return path.join(problemWorkspaceDir, 'history.json');
}

// Function to flush events from a buffer to disk
export async function flushBuffer(problemId: string, bufferType: 'batch' | 'run'): Promise<void> {
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

  const historyFilePath = getProblemHistoryFilePath(problemId);
  const problemWorkspaceDir = path.join(getUserWorkspacesRoot(), problemId);

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

    if (bufferType === 'batch') {
      buffers.batchBuffer.length = 0;
    } else {
      buffers.runEventsBuffer.length = 0;
    }

  } catch (error: any) {
    console.error(`Failed to flush history for problem ${problemId}:`, error);
  }
}

export async function flushAllHistoryBuffers(): Promise<void> {
  for (const problemId of historyBuffers.keys()) {
    await flushBuffer(problemId, 'batch');
    await flushBuffer(problemId, 'run');
  }
}

export function setupHistoryManager(ipcMain: Electron.IpcMain) {
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
        buffers.runEventsBuffer.length = 0;
        buffers.batchBuffer.push(historyEvent);
        await flushBuffer(problemId, 'batch');
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
        await flushBuffer(problemId, 'batch');
        break;

      case 'problem_loaded':
      case 'problem_saved':
      case 'problem_switched':
      case 'audio_record_start':
      case 'audio_record_stop':
      case 'audio_play':
        buffers.batchBuffer.push(historyEvent);
        await flushBuffer(problemId, 'batch');
        break;

      default:
        console.warn(`Unknown history event type: ${eventType}`);
        break;
    }
  });
}