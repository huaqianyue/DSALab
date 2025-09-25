// Copyright (C) 2021 Guyutongxue
//
// This file is part of Dev-C++ 7.
//
// Dev-C++ 7 is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Dev-C++ 7 is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Dev-C++ 7.  If not, see <http://www.gnu.org/licenses/>.

import { Injectable } from '@angular/core';
import { ElectronService } from '../core/services';
import { HistoryEvent, SimplifiedContentChange } from './dsalab-types';

/**
 * DSALab历史记录管理服务
 * 与原始DSALab的历史记录逻辑完全一致
 */
@Injectable({
  providedIn: 'root'
})
export class DSALabHistoryService {

  constructor(private electronService: ElectronService) {}

  /**
   * 记录代码编辑事件
   * @param problemId 问题ID
   * @param operationType 操作类型
   * @param change 内容变化
   * @param cursorPosition 光标位置
   */
  recordCodeEditEvent(
    problemId: string,
    operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'other_edit',
    change: SimplifiedContentChange,
    cursorPosition: { lineNumber: number; column: number }
  ): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType: 'edit',
      operationType,
      change,
      cursorPosition
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录程序运行开始事件
   * @param problemId 问题ID
   * @param codeSnapshot 代码快照
   */
  recordProgramRunStartEvent(problemId: string, codeSnapshot: string): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType: 'run_start',
      codeSnapshot
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录程序输出事件
   * @param problemId 问题ID
   * @param eventType 事件类型
   * @param data 输出数据
   * @param outputType 输出类型
   */
  recordProgramOutputEvent(
    problemId: string,
    eventType: 'program_output' | 'program_error' | 'user_input',
    data: string,
    outputType: 'log' | 'error' | 'user-input' | 'info' | 'result'
  ): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType,
      data,
      outputType
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录程序运行结束事件
   * @param problemId 问题ID
   * @param eventType 事件类型
   * @param success 是否成功
   * @param exitCode 退出代码
   * @param signal 信号
   * @param durationMs 持续时间
   * @param errorMessage 错误消息
   */
  recordProgramRunEndEvent(
    problemId: string,
    eventType: 'run_end' | 'compile_error' | 'run_timeout' | 'program_terminated_by_new_run',
    success: boolean,
    exitCode: number | null = null,
    signal: NodeJS.Signals | null = null,
    durationMs?: number,
    errorMessage?: string
  ): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType,
      success,
      exitCode,
      signal,
      durationMs,
      errorMessage
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录问题生命周期事件
   * @param problemId 问题ID
   * @param eventType 事件类型
   * @param codeSnapshot 代码快照
   * @param audioState 音频状态
   */
  recordProblemLifecycleEvent(
    problemId: string,
    eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched',
    codeSnapshot?: string,
    audioState?: 'present' | 'absent' | 'modified'
  ): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType,
      codeSnapshot,
      audioState
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录音频事件
   * @param problemId 问题ID
   * @param eventType 事件类型
   * @param durationMs 持续时间
   * @param audioSizeKB 音频大小
   */
  recordAudioEvent(
    problemId: string,
    eventType: 'audio_record_start' | 'audio_record_pause' | 'audio_record_resume' | 'audio_record_stop' | 'audio_play',
    durationMs?: number,
    audioSizeKB?: number
  ): void {
    const event: HistoryEvent = {
      timestamp: Date.now(),
      problemId,
      eventType,
      durationMs,
      audioSizeKB
    } as any;

    this.recordHistoryEvent(event);
  }

  /**
   * 记录历史事件到后端
   * @param event 历史事件
   */
  private recordHistoryEvent(event: HistoryEvent): void {
    try {
      this.electronService.ipcRenderer.send('dsalab-record-history' as any, event);
    } catch (error) {
      console.error('Failed to record history event:', error);
    }
  }

  /**
   * 获取事件类型的中文描述
   * @param eventType 事件类型
   * @returns 中文描述
   */
  getEventTypeDescription(eventType: string): string {
    const descriptions: { [key: string]: string } = {
      'edit': '代码编辑',
      'run_start': '开始运行',
      'program_output': '程序输出',
      'program_error': '程序错误',
      'user_input': '用户输入',
      'run_end': '运行结束',
      'compile_error': '编译错误',
      'run_timeout': '运行超时',
      'program_terminated_by_new_run': '被新运行终止',
      'problem_loaded': '问题加载',
      'problem_saved': '问题保存',
      'problem_switched': '问题切换',
      'audio_record_start': '开始录音',
      'audio_record_pause': '暂停录音',
      'audio_record_resume': '恢复录音',
      'audio_record_stop': '停止录音',
      'audio_play': '播放音频'
    };

    return descriptions[eventType] || eventType;
  }

  /**
   * 格式化历史事件为可读字符串
   * @param event 历史事件
   * @returns 格式化字符串
   */
  formatHistoryEvent(event: HistoryEvent): string {
    const date = new Date(event.timestamp);
    const timeStr = date.toLocaleString('zh-CN');
    const typeDesc = this.getEventTypeDescription(event.eventType);
    
    return `[${timeStr}] ${typeDesc} - 问题 ${event.problemId}`;
  }

  /**
   * 检查事件类型是否需要立即写入磁盘
   * @param eventType 事件类型
   * @returns 是否需要立即写入
   */
  shouldFlushImmediately(eventType: string): boolean {
    const immediateFlushEvents = [
      'run_start', 'run_end', 'compile_error', 'run_timeout',
      'program_terminated_by_new_run', 'problem_loaded', 
      'problem_saved', 'problem_switched', 'audio_record_start',
      'audio_record_stop', 'audio_play'
    ];

    return immediateFlushEvents.includes(eventType);
  }
}