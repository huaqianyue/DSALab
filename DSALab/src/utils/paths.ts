// src/utils/paths.ts
import { app } from 'electron';
import path from 'node:path';

let USER_DATA_PATH: string;
let DOCUMENTS_PATH: string;

export function initPaths() {
  USER_DATA_PATH = app.getPath('userData');
  DOCUMENTS_PATH = app.getPath('documents');
}

export const getLocalProblemsJsonPath = () => path.join(USER_DATA_PATH, 'DSALab', 'problems.json');
export const getUserWorkspacesRoot = () => path.join(DOCUMENTS_PATH, 'DSALab Workspaces');
export const getAppSettingsPath = () => path.join(USER_DATA_PATH, 'DSALab', 'settings.json');
export const getTempCppDir = () => path.join(app.getPath('temp'), 'DSALab-cpp');

export const CDN_PROBLEMS_URL = 'https://raw.githubusercontent.com/huaqianyue/DSALab/refs/heads/main/problem.json';