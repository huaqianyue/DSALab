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
import { FormsModule } from '@angular/forms';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import { NzTreeViewModule } from 'ng-zorro-antd/tree-view';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';

import { CoreModule } from '../../core/core.module';

import { WatchComponent } from './watch/watch.component';
import { ProblemListComponent } from './problem-list/problem-list.component';
import { ProblemDescriptionComponent } from './problem-description/problem-description.component';

@NgModule({
  declarations: [ WatchComponent, ProblemListComponent, ProblemDescriptionComponent ],
  imports: [
    CommonModule,
    FormsModule,
    NzTreeModule,
    NzTreeViewModule,
    NzInputModule,
    NzButtonModule,
    NzTagModule,
    NzIconModule,
    NzListModule,
    NzEmptyModule,
    NzCardModule,
    NzToolTipModule,
    CoreModule
  ],
  exports: [ WatchComponent, ProblemListComponent, ProblemDescriptionComponent ]
})
export class SidebarModule { }
