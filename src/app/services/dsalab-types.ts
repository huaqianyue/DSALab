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

// DSALab 相关类型定义

// 历史记录相关类型定义
export interface HistoryEventBase {
  timestamp: number;
  problemId: string;
  eventType: string; // e.g., 'edit', 'run_start', 'run_end', 'program_output'
}

export interface SimplifiedContentChange {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  rangeLength: number;
  text: string;
  rangeOffset: number;
  deletedText?: string; // 被删除的文本（仅用于删除操作）
}

export interface CodeEditEvent extends HistoryEventBase {
  eventType: 'edit';
  operationType: 'type' | 'ime_input' | 'paste_insert' | 'paste_replace' | 'delete' | 'undo_redo' | 'other_edit';
  change: SimplifiedContentChange;
  cursorPosition: { lineNumber: number; column: number };
}

export interface ProgramRunStartEvent extends HistoryEventBase {
  eventType: 'run_start';
  codeSnapshot: string; // Full code at the moment of run
}

export interface ProgramOutputEvent extends HistoryEventBase {
  eventType: 'program_output' | 'program_error' | 'user_input';
  data: string;
  outputType: 'log' | 'error' | 'user-input' | 'info' | 'result'; // Corresponds to cpp-output-chunk types
}

export interface ProgramRunEndEvent extends HistoryEventBase {
  eventType: 'run_end' | 'compile_error' | 'run_timeout' | 'program_terminated_by_new_run';
  success: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs?: number; // Time taken for execution
  errorMessage?: string; // For compile_error, run_timeout, or general run_end error
}

export interface ProblemLifecycleEvent extends HistoryEventBase {
  eventType: 'problem_loaded' | 'problem_saved' | 'problem_switched';
  codeSnapshot?: string; // Code at load/save/switch
  audioState?: 'present' | 'absent' | 'modified'; // Audio state at save
}

export interface AudioEvent extends HistoryEventBase {
  eventType: 'audio_record_start' | 'audio_record_pause' | 'audio_record_resume' | 'audio_record_stop' | 'audio_play';
  durationMs?: number; // For record_stop, play
  audioSizeKB?: number; // For record_stop
}

export type HistoryEvent = CodeEditEvent | ProgramRunStartEvent | ProgramOutputEvent | ProgramRunEndEvent | ProblemLifecycleEvent | AudioEvent;

// 定义问题数据结构
export interface Problem {
  id: string;
  Title: string;
  shortDescription: string;
  fullDescription: string;
  isDelete: boolean;
  Audio: string;
  Code: string;
  // 新增测试相关字段
  studentDebugTemplate?: string;
  judgeTemplate?: string;
  testStatus?: 'passed' | 'failed' | 'not_tested';
  testScore?: number; // 测试分数 (0-100)
}

// 定义每个问题的工作区数据结构
export interface ProblemWorkspaceData {
  content: string;
  isDirty: boolean;
  output: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  filePath: string | null;
  audioModified: boolean;
}

// 应用设置接口
export interface DSALabSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}

// 国际化翻译文本类型
export type Translations = {
  [key: string]: string;
};

export type Language = 'en' | 'zh';

export interface AppTranslations {
  en: Translations;
  zh: Translations;
}
