import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../../../services/settings.service';

@Component({
  selector: 'app-build-setting',
  templateUrl: './build-setting.component.html',
  styleUrls: ['./build-setting.component.scss']
})
export class BuildSettingComponent implements OnInit {

  constructor(private route: ActivatedRoute,
    private settingsService: SettingsService) { }

  ngOnInit() { }

  saveOption() {
    this.settingsService.saveSetting('build');
  }

  resetOption() {
    this.settingsService.resetSetting('build');
  }

}
