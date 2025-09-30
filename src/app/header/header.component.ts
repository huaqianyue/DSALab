import { Component, OnInit, ViewEncapsulation } from '@angular/core';

import { Command } from '../services/status.service';
import { DropdownList } from './header-dropdown/header-dropdown.component';


@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HeaderComponent implements OnInit {

  readonly commandList: {
    [key: string]: Command
  };

  // 隐藏文件菜单相关功能
  // fileMenuId: DropdownList = [
  //   "file.new",
  //   "file.open",
  //   "#divider",
  //   "file.save",
  //   "file.saveAs"
  // ];
  editMenuId: DropdownList = [
    "edit.undo",
    "edit.redo",
    "#divider",
    "edit.cut",
    "edit.copy",
    "edit.paste",
    "#divider",
    "edit.find",
    "edit.replace",
    "#divider",
    "edit.commentLine",
    "#divider",
    "file.save"  // 将保存移动到编辑菜单中
  ];
  runMenuId: DropdownList = [
    "build.run",
    "#divider",
    "debug.start",
    "debug.exit"
  ];

  toolMenuId: DropdownList = [
    "tool.openBuildSetting"
  ];

  helpMenuId: DropdownList = [
    "help.welcome"
  ];

  constructor() {
  }

  ngOnInit(): void {
  }
}
