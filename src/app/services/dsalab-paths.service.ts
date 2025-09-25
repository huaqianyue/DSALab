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

/**
 * DSALab路径管理服务
 * 与原始DSALab的路径管理逻辑完全一致
 */
@Injectable({
  providedIn: 'root'
})
export class DSALabPathsService {

  constructor(private electronService: ElectronService) {}

  /**
   * 获取工作区根目录路径
   * 返回：Documents/DSALab Workspaces
   */
  async getWorkspaceRoot(): Promise<string> {
    try {
      return await this.electronService.ipcRenderer.invoke('dsalab-get-workspace-root' as any);
    } catch (error) {
      console.error('Failed to get workspace root:', error);
      throw error;
    }
  }

  /**
   * 构建问题工作区路径
   * @param problemId 问题ID
   * @returns Documents/DSALab Workspaces/{problemId}
   */
  async getProblemWorkspacePath(problemId: string): Promise<string> {
    const workspaceRoot = await this.getWorkspaceRoot();
    return `${workspaceRoot}/${problemId}`;
  }

  /**
   * 构建问题代码文件路径
   * @param problemId 问题ID
   * @returns Documents/DSALab Workspaces/{problemId}/code.cpp
   */
  async getProblemCodePath(problemId: string): Promise<string> {
    const workspacePath = await this.getProblemWorkspacePath(problemId);
    return `${workspacePath}/code.cpp`;
  }

  /**
   * 构建问题音频文件路径
   * @param problemId 问题ID
   * @returns Documents/DSALab Workspaces/{problemId}/audio.webm
   */
  async getProblemAudioPath(problemId: string): Promise<string> {
    const workspacePath = await this.getProblemWorkspacePath(problemId);
    return `${workspacePath}/audio.webm`;
  }

  /**
   * 构建问题历史文件路径
   * @param problemId 问题ID
   * @returns Documents/DSALab Workspaces/{problemId}/history.json
   */
  async getProblemHistoryPath(problemId: string): Promise<string> {
    const workspacePath = await this.getProblemWorkspacePath(problemId);
    return `${workspacePath}/history.json`;
  }

  /**
   * 验证路径格式是否符合DSALab标准
   * @param problemId 问题ID
   * @returns 是否有效
   */
  isValidProblemId(problemId: string): boolean {
    // 检查问题ID格式：只允许字母、数字、下划线和连字符
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(problemId) && problemId.length > 0 && problemId.length <= 50;
  }

  /**
   * 获取DSALab支持的文件扩展名
   */
  getSupportedFileExtensions(): string[] {
    return ['.cpp', '.webm', '.json'];
  }

  /**
   * 检查文件是否为DSALab支持的类型
   * @param fileName 文件名
   * @returns 是否支持
   */
  isSupportedFile(fileName: string): boolean {
    const supportedExtensions = this.getSupportedFileExtensions();
    return supportedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  /**
   * 获取DSALab工作区结构信息
   */
  getWorkspaceStructureInfo(): { 
    description: string;
    files: Array<{ name: string; description: string; required: boolean }>;
  } {
    return {
      description: 'DSALab问题工作区结构（与原始DSALab完全一致）',
      files: [
        { 
          name: 'code.cpp', 
          description: '问题的C++代码文件', 
          required: true 
        },
        { 
          name: 'audio.webm', 
          description: '问题的音频记录文件', 
          required: false 
        },
        { 
          name: 'history.json', 
          description: '问题的操作历史记录文件', 
          required: false 
        }
      ]
    };
  }
}
