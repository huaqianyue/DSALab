// Copyright (C) 2021 Guyutongxue
// 
// This file is part of Dev-C++ 7.
// 
// Dev-C++ 7 is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// Dev-C++ 7 is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with Dev-C++ 7.  If not, see <http://www.gnu.org/licenses/>.

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzNotificationModule } from 'ng-zorro-antd/notification';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzNoAnimationModule } from 'ng-zorro-antd/core/no-animation';
import { NzMessageModule } from 'ng-zorro-antd/message';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzFormModule } from 'ng-zorro-antd/form';
import { FormsModule } from '@angular/forms';

import { FileControlComponent } from './file-control/file-control.component';
import { BuildControlComponent } from './build-control/build-control.component';
import { DSALabControlComponent } from './dsalab-control/dsalab-control.component';
import { HeaderComponent } from './header.component';
import { HeaderDropdownComponent, ShortcutTranslatePipe, TypeofPipe } from './header-dropdown/header-dropdown.component';
import { CoreModule } from '../core/core.module';

@NgModule({
  declarations: [
    FileControlComponent,
    BuildControlComponent,
    DSALabControlComponent,
    HeaderComponent,
    HeaderDropdownComponent,
    TypeofPipe, 
    ShortcutTranslatePipe
  ],
  imports: [
    CommonModule,
    FormsModule,
    NzDropDownModule,
    NzButtonModule,
    NzModalModule,
    NzNotificationModule,
    NzIconModule,
    NzNoAnimationModule,
    NzMessageModule,
    NzAlertModule,
    NzListModule,
    NzCheckboxModule,
    NzTagModule,
    NzEmptyModule,
    NzToolTipModule,
    NzFormModule,
    CoreModule
  ],
  exports: [HeaderComponent]
})
export class HeaderModule { }
