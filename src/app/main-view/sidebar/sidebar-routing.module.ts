import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { WatchComponent } from './watch/watch.component';
import { ProblemListComponent } from './problem-list/problem-list.component';
import { ProblemDescriptionComponent } from './problem-description/problem-description.component';

const routes: Routes = [
  {
    path: 'watch',
    component: WatchComponent,
    outlet: 'sidebar'
  },
  {
    path: 'problem-list',
    component: ProblemListComponent,
    outlet: 'sidebar'
  },
  {
    path: 'problem-description',
    component: ProblemDescriptionComponent,
    outlet: 'sidebar'
  }
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SidebarRoutingModule {}