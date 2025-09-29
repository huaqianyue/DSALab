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
import { SharedModule } from '../../shared/shared.module';

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
    CoreModule,
    SharedModule
  ],
  exports: [ WatchComponent, ProblemListComponent, ProblemDescriptionComponent ]
})
export class SidebarModule { }
