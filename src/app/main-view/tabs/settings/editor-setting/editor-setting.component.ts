import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../../../services/settings.service';

@Component({
  selector: 'app-editor-setting',
  templateUrl: './editor-setting.component.html',
  styleUrls: ['./editor-setting.component.scss']
})
export class EditorSettingComponent implements OnInit {

  constructor(private route: ActivatedRoute,
    private settingsService: SettingsService,) { }

  ngOnInit() { }

  saveOption() {
    this.settingsService.saveSetting('editor');
  }

  resetOption() {
    this.settingsService.resetSetting('editor');
  }

}
