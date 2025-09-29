import { Component, OnInit } from '@angular/core';

import { FileService } from '../../services/file.service';
import { StatusService } from '../../services/status.service';
import { DSALabProblemService } from '../../services/dsalab-problem.service';
import { TabsService } from '../../services/tabs.service';

@Component({
  selector: 'app-file-control',
  templateUrl: './file-control.component.html',
  styleUrls: ['./file-control.component.scss']
})
export class FileControlComponent implements OnInit {

  constructor(
    private fileService: FileService,
    private statusService: StatusService,
    private dsalabService: DSALabProblemService,
    private tabsService: TabsService
  ) { }

  get isSaveEnable() {
    return this.statusService.saveEnabled;
  }

  ngOnInit(): void { }

  newFile() {
    this.fileService.new();
  }

  openFile() {
    this.fileService.open();
  }

  async saveFile() {
    // 检查当前标签页是否为DSALab问题
    const activeTab = this.tabsService.getActive().value;
    if (activeTab && activeTab.key.startsWith('dsalab-')) {
      // 这是DSALab问题标签页，使用DSALab保存逻辑
      try {
        // 同步编辑器内容到标签页
        this.tabsService.syncActiveCode();
        
        // 更新DSALab服务中的代码内容
        this.dsalabService.updateCurrentProblemCode(activeTab.code);
        
        // 保存当前问题
        await this.dsalabService.saveCurrentProblem();
        
        // 标记标签页为已保存
        activeTab.saved = true;
        
        console.log('DSALab problem saved successfully');
      } catch (error) {
        console.error('Failed to save DSALab problem:', error);
      }
    } else {
      // 普通文件，使用原有保存逻辑
      this.fileService.save();
    }
  }
}
