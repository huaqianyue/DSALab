import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { BuildService } from '../../services/build.service';
import { StatusService } from '../../services/status.service';
import { TabsService } from '../../services/tabs.service';

@Component({
  selector: 'app-build-control',
  templateUrl: './build-control.component.html',
  styleUrls: ['./build-control.component.scss']
})
export class BuildControlComponent implements OnInit, OnDestroy {
  isRunning = false;
  isTesting = false;
  
  private destroy$ = new Subject<void>();

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

  ngOnInit(): void {
    // 订阅运行状态
    this.buildService.isRunning$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isRunning => {
        this.isRunning = isRunning;
      });
    
    // 订阅测试状态
    this.buildService.isTesting$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isTesting => {
        this.isTesting = isTesting;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  runExe() {
    if (this.isRunning) {
      // 如果正在运行，则取消运行
      this.buildService.cancelRun();
    } else {
      // 否则开始运行（会自动编译）
      this.buildService.runExe();
    }
  }

  runTest() {
    this.buildService.runTest();
  }
}
