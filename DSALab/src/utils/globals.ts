// src/utils/globals.ts
import { ChildProcessWithoutNullStreams } from 'node:child_process';
import { HistoryEvent } from '../types'; // 导入 HistoryEvent 类型

// Global variable for tracking C++ process
export let cppProcess: ChildProcessWithoutNullStreams | null = null;

export function setCppProcess(process: ChildProcessWithoutNullStreams | null) {
  cppProcess = process;
}

// Buffers for history events, per problemId (主进程内部状态)
export const historyBuffers: Map<string, {
  batchBuffer: HistoryEvent[];
  runEventsBuffer: HistoryEvent[];
  batchTimer: NodeJS.Timeout | null;
}> = new Map();

export const HISTORY_FLUSH_BATCH_INTERVAL_MS = 30000; // 30 seconds for batch events