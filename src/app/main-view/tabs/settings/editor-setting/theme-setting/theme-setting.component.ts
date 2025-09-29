import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ElectronService } from '../../../../../core/services';
import { SettingsGuard, SettingsService } from '../../../../../services/settings.service';

@Component({
  selector: 'app-theme-setting',
  templateUrl: './theme-setting.component.html',
  styleUrls: ['./theme-setting.component.scss']
})
export class ThemeSettingComponent implements OnInit {

  themeList: string[] = ['1', '2'];

  constructor(private settingsService: SettingsService,
    private electronService: ElectronService,
    private settingsGuard: SettingsGuard) {
  }

  get currentThemeOptions(): { activeName: string } {
    return this.settingsService.getOptions('editor').theme;
  }

  ngOnInit(): void {
    this.settingsGuard.lastVisitedUrl['~editor'] = 'theme';
    this.refreshList();
  }

  refreshList(): void {
    this.electronService.ipcRenderer.invoke('theme/getList').then(v => this.themeList = v);
  }

  onChange(): void {
    this.settingsService.onChange('editor');
  }

}
