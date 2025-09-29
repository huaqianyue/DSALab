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
