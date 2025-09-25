// src/utils/problemManager.ts
import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Problem } from '../types'; // 从 src/types 导入 Problem 类型
import { getLocalProblemsJsonPath, getUserWorkspacesRoot, CDN_PROBLEMS_URL } from './paths';

// 新增：用于解析原始 JSON 数据的接口，兼容 isDelete 为 string 的情况
// 这个接口是内部用于数据转换的，不应该暴露到共享 types.ts
interface RawProblem {
  id: string;
  shortDescription: string;
  fullDescription: string;
  isDelete?: string | boolean;
  Audio?: string;
  Code?: string;
}

// 辅助函数，用于验证原始数据并转换为 Problem 接口
function convertToProblem(raw: RawProblem): Problem | null {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    typeof raw.id === 'string' &&
    typeof raw.shortDescription === 'string' &&
    typeof raw.fullDescription === 'string'
  ) {
    // 假设 Problem 接口中 Title 字段是 shortDescription 的别名或者需要从 shortDescription 派生
    // 如果 Problem 接口有 Title 字段，这里需要根据实际情况调整
    // 原始 main.ts 中 Problem 接口没有 Title，但你的 src/types.ts 中有
    // 假设 Problem.Title = Problem.shortDescription
    return {
      id: raw.id,
      Title: raw.shortDescription, // 根据 src/types.ts 中的 Problem 接口添加 Title
      shortDescription: raw.shortDescription,
      fullDescription: raw.fullDescription,
      isDelete: raw.isDelete === true || raw.isDelete === 'true',
      Audio: raw.Audio || '',
      Code: raw.Code || '',
    };
  }
  return null;
}

// 辅助函数，用于按 ID 排序题目列表
function sortProblemsById(problems: Problem[]): Problem[] {
  return problems.sort((a, b) => a.id.localeCompare(b.id));
}

// 辅助函数 - 从 CDN 获取题目
async function fetchProblemsFromCDN(webContents: Electron.WebContents): Promise<RawProblem[]> {
  webContents.send('cpp-output-chunk', { type: 'info', data: '在线获取最新题目列表...\n' });
  console.log('Fetching problems from CDN...');
  try {
    const response = await fetch(CDN_PROBLEMS_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }
    const cdnProblems = await response.json();
    console.log('Fetched problems from CDN successfully.');
    return cdnProblems;
  } catch (error: any) {
    console.error('Failed to fetch problems from CDN:', error);
    webContents.send('cpp-output-chunk', { type: 'error', data: `无法加载题目列表，请检查网络连接。\n错误: ${error instanceof Error ? error.message : String(error)}\n` });
    throw error;
  }
}

// 辅助函数 - 只读取本地 problems.json
export async function loadPureLocalProblems(): Promise<Problem[]> {
  const localProblemsJsonPath = getLocalProblemsJsonPath();
  await fs.mkdir(path.dirname(localProblemsJsonPath), { recursive: true });
  try {
    const content = await fs.readFile(localProblemsJsonPath, 'utf-8');
    const rawLocalProblems: RawProblem[] = JSON.parse(content);
    const problems: Problem[] = [];
    rawLocalProblems.forEach(rawP => {
      const p = convertToProblem(rawP);
      if (p) {
        problems.push(p);
      }
    });
    console.log('Successfully read local problems.json.');
    return sortProblemsById(problems);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('Local problems.json not found, returning empty list.');
    } else {
      console.error('Failed to read local problems.json:', error);
    }
    return [];
  }
}

// 辅助函数 - 合并题目列表
function mergeProblemLists(
  localProblems: Problem[],
  incomingProblemsRaw: RawProblem[],
  sourceIsCDN: boolean = true
): Problem[] {
  const localMap = new Map<string, Problem>();
  localProblems.forEach(p => localMap.set(p.id, { ...p }));

  const incomingMap = new Map<string, RawProblem>();
  incomingProblemsRaw.forEach(p => incomingMap.set(p.id, p));

  const finalProblemsMap = new Map<string, Problem>();

  for (const [id, incomingRaw] of incomingMap.entries()) {
    const incomingProblem = convertToProblem(incomingRaw);
    if (!incomingProblem) {
      console.warn(`Skipping invalid incoming problem during merge: ${JSON.stringify(incomingRaw)}`);
      continue;
    }

    if (localMap.has(id)) {
      const existingLocal = localMap.get(id)!;
      finalProblemsMap.set(id, {
        ...existingLocal,
        shortDescription: incomingProblem.shortDescription,
        fullDescription: incomingProblem.fullDescription,
        Title: incomingProblem.shortDescription, // 确保 Title 也更新
        isDelete: false,
      });
      localMap.delete(id);
    } else {
      finalProblemsMap.set(id, {
        ...incomingProblem,
        Audio: '',
        Code: '',
        isDelete: false,
      });
    }
  }

  for (const [id, localProblem] of localMap.entries()) {
    if (sourceIsCDN) {
      finalProblemsMap.set(id, { ...localProblem, isDelete: true });
    } else {
      finalProblemsMap.set(id, { ...localProblem });
    }
  }

  return sortProblemsById(Array.from(finalProblemsMap.values()));
}

// 辅助函数 - 保存题目列表到文件
async function saveProblemsToFile(problems: Problem[]): Promise<void> {
  try {
    await fs.writeFile(getLocalProblemsJsonPath(), JSON.stringify(problems, null, 2), 'utf-8');
    console.log('Problems saved to local problems.json successfully.');
  } catch (error: any) {
    console.error('Failed to save problems to local file:', error);
    throw error;
  }
}

export function setupProblemManager(ipcMain: Electron.IpcMain) {
  ipcMain.handle('get-problems-from-local', async (event): Promise<Problem[]> => {
    await fs.mkdir(path.dirname(getLocalProblemsJsonPath()), { recursive: true });
    await fs.mkdir(getUserWorkspacesRoot(), { recursive: true });

    let localProblems: Problem[] = await loadPureLocalProblems();
    let cdnProblems: RawProblem[] = [];

    try {
      cdnProblems = await fetchProblemsFromCDN(event.sender);
    } catch (cdnError) {
      console.warn('CDN fetch failed during initial load, returning local problems only.');
      event.sender.send('cpp-output-chunk', { type: 'info', data: '请检查是否能连接GitHub或使用导入功能更新题目！\n' });
      return localProblems;
    }

    const mergedProblems = mergeProblemLists(localProblems, cdnProblems, true);

    try {
      await saveProblemsToFile(mergedProblems);
      event.sender.send('cpp-output-chunk', { type: 'info', data: '题目列表已成功加载并更新。\n' });
      return mergedProblems;
    } catch (saveError: any) {
      console.error('Failed to save merged problems to local during initial load:', saveError);
      dialog.showErrorBox('保存题目失败', `无法保存合并后的题目列表到本地文件。\n错误: ${saveError.message}`);
      return mergedProblems;
    }
  });

  ipcMain.handle('get-pure-local-problems', async (): Promise<Problem[]> => {
    return await loadPureLocalProblems();
  });

  ipcMain.handle('refresh-problems', async (event): Promise<Problem[]> => {
    await fs.mkdir(path.dirname(getLocalProblemsJsonPath()), { recursive: true });
    await fs.mkdir(getUserWorkspacesRoot(), { recursive: true });

    let cdnProblems: RawProblem[];
    try {
      cdnProblems = await fetchProblemsFromCDN(event.sender);
    } catch (error) {
      throw error;
    }

    const localProblems: Problem[] = await loadPureLocalProblems();

    const mergedProblems = mergeProblemLists(localProblems, cdnProblems, true);

    try {
      await saveProblemsToFile(mergedProblems);
      event.sender.send('cpp-output-chunk', { type: 'info', data: '题目列表已成功刷新并更新。\n' });
      return mergedProblems;
    } catch (saveError: any) {
      console.error('Failed to save refreshed problems to local:', saveError);
      dialog.showErrorBox('保存题目失败', `无法保存刷新后的题目列表到本地文件。\n错误: ${saveError.message}`);
      return mergedProblems;
    }
  });

  ipcMain.handle('read-pure-local-problems', async (): Promise<Problem[]> => {
    return await loadPureLocalProblems();
  });

  ipcMain.handle('import-problems', async (event, jsonContent: string) => {
    try {
      const importedRaw: RawProblem[] = JSON.parse(jsonContent);
      if (!Array.isArray(importedRaw)) {
        throw new Error('Imported JSON is not an array.');
      }

      const validImportedProblemsRaw: RawProblem[] = [];
      let invalidProblemCount = 0;

      for (const item of importedRaw) {
        if (convertToProblem(item)) {
          validImportedProblemsRaw.push(item);
        } else {
          invalidProblemCount++;
        }
      }

      if (validImportedProblemsRaw.length === 0 && importedRaw.length > 0) {
          throw new Error('No valid problems found in the imported JSON file.');
      }

      const currentLocalProblems = await loadPureLocalProblems();

      const mergedProblems = mergeProblemLists(currentLocalProblems, validImportedProblemsRaw, false);

      await saveProblemsToFile(mergedProblems);
      console.log(`Imported problems merged and saved. ${validImportedProblemsRaw.length} valid problems added/updated, ${invalidProblemCount} invalid problems skipped.`);
      return { success: true, problems: mergedProblems, invalidCount: invalidProblemCount };

    } catch (error: any) {
      console.error('Failed to import problems:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-problems-to-local', async (event, problems: Problem[]) => {
    try {
      const sortedProblems = sortProblemsById(problems);
      await saveProblemsToFile(sortedProblems);
      console.log('Local problems.json saved successfully by renderer.');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to save problems to local by renderer:', error);
      return { success: false, error: error.message };
    }
  });
}