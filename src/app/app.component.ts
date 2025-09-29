import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { ElectronService } from './core/services';
import { TranslateService } from '@ngx-translate/core';
import { AppConfig } from '../environments/environment';

import { HotkeysService } from './services/hotkeys.service';
import { StatusService } from './services/status.service';
import { ThemeService } from './services/theme.service';
import { DSALabHistoryService } from './services/dsalab-history.service';
import { DSALabProblemService } from './services/dsalab-problem.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  constructor(
    private electronService: ElectronService,
    private translate: TranslateService,
    private statusService: StatusService,
    private themeService: ThemeService,
    private dsalabHistoryService: DSALabHistoryService,
    private dsalabProblemService: DSALabProblemService
  ) {
    this.translate.setDefaultLang('en');
    console.log('AppConfig', AppConfig);

    if (electronService.isElectron) {
      console.log(process.env);
      console.log('Run in electron');
      console.log('Electron ipcRenderer', this.electronService.ipcRenderer);
      console.log('NodeJS childProcess', this.electronService.childProcess);
    } else {
      console.log('Run in browser');
    }
    this.windowHeight = window.innerHeight;
  }

  private windowHeight: number;

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.windowHeight = window.innerHeight;
  }

  get headerHeight() {
    return 32 + 1 * 32;
  }


  get mainViewHeight() {
    return this.windowHeight - this.headerHeight;
  }

  async ngOnInit(): Promise<void> {
    // this.electronService.ipcRenderer.invoke('window/toggleDevTools');
    this.themeService.setTheme();
    const [mingwPath, useBundled] = await Promise.all([
      this.electronService.getConfig('env.mingwPath'),
      this.electronService.getConfig('env.useBundledMingw')
    ]);
    if (!useBundled && mingwPath === '') {
      this.setEnvModal = true;
    }

  }

  setEnvModal = false;
  tempMingwPath = "";
  tempUseBundledMingw = false;

  confirmPaths(): void {
    this.electronService.setConfig('env.mingwPath', this.tempMingwPath);
    this.electronService.setConfig('env.useBundledMingw', this.tempUseBundledMingw);
    this.setEnvModal = false;
  }

  async selectMingwPathInModal(): Promise<void> {
    try {
      const result = await this.electronService.ipcRenderer.invoke('file/openDirectoryDialog', {
        title: '选择MinGW安装目录',
        defaultPath: this.tempMingwPath || ''
      });
      
      if (result && result.success && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        this.tempMingwPath = result.filePaths[0];
      }
    } catch (error) {
      console.error('选择文件夹失败:', error);
    }
  }

  ngOnDestroy(): void {
    // 组件销毁时的清理工作
  }

}
