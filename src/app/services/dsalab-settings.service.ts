import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ElectronService } from '../core/services';

export interface DSALabSettings {
  userName: string;
  studentId: string;
  lastOpenedProblemId: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class DSALabSettingsService {
  private settingsSubject = new BehaviorSubject<DSALabSettings>({
    userName: '',
    studentId: '',
    lastOpenedProblemId: null
  });

  public settings$: Observable<DSALabSettings> = this.settingsSubject.asObservable();

  constructor(private electronService: ElectronService) {
    this.loadSettings();
  }

  // 获取当前设置
  get currentSettings(): DSALabSettings {
    return this.settingsSubject.value;
  }

  // 加载设置
  async loadSettings(): Promise<void> {
    try {
      const settings = await this.electronService.ipcRenderer.invoke('dsalab-load-settings' as any) as DSALabSettings;
      this.settingsSubject.next(settings);
      console.log('📋 DSALab settings loaded:', settings);
    } catch (error) {
      console.error('Failed to load DSALab settings:', error);
      // 使用默认设置
      this.settingsSubject.next({
        userName: '',
        studentId: '',
        lastOpenedProblemId: null
      });
    }
  }

  // 保存设置
  async saveSettings(settings: Partial<DSALabSettings>): Promise<void> {
    try {
      const currentSettings = this.settingsSubject.value;
      const newSettings = { ...currentSettings, ...settings };
      
      await this.electronService.ipcRenderer.invoke('dsalab-save-settings' as any, newSettings);
      this.settingsSubject.next(newSettings);
      console.log('💾 DSALab settings saved:', newSettings);
    } catch (error) {
      console.error('Failed to save DSALab settings:', error);
      throw error;
    }
  }

  // 更新用户名
  async updateUserName(userName: string): Promise<void> {
    await this.saveSettings({ userName });
  }

  // 更新学号
  async updateStudentId(studentId: string): Promise<void> {
    await this.saveSettings({ studentId });
  }

  // 更新最后打开的题目ID
  async updateLastOpenedProblemId(problemId: string | null): Promise<void> {
    await this.saveSettings({ lastOpenedProblemId: problemId });
  }

  // 获取用户名
  get userName(): string {
    return this.settingsSubject.value.userName;
  }

  // 获取学号
  get studentId(): string {
    return this.settingsSubject.value.studentId;
  }

  // 获取最后打开的题目ID
  get lastOpenedProblemId(): string | null {
    return this.settingsSubject.value.lastOpenedProblemId;
  }
}
