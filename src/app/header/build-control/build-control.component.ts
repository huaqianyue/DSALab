import { Component, OnInit } from '@angular/core';

import { BuildService } from '../../services/build.service';
import { StatusService } from '../../services/status.service';
import { TabsService } from '../../services/tabs.service';

@Component({
  selector: 'app-build-control',
  templateUrl: './build-control.component.html',
  styleUrls: ['./build-control.component.scss']
})
export class BuildControlComponent implements OnInit {

  constructor(
    private buildService: BuildService,
    private statusService: StatusService,
    private tabsService: TabsService
  ) { }

  get enabled() {
    return this.statusService.saveEnabled;
  }

  get isDSALabTab() {
    const activeTab = this.tabsService.getActive().value;
    return activeTab && activeTab.key.startsWith('dsalab-');
  }

  ngOnInit(): void { }

  compile() {
    this.buildService.compile();
  }

  runExe() {
    this.buildService.runExe();
  }

  runTest() {
    this.buildService.runTest();
  }
}
