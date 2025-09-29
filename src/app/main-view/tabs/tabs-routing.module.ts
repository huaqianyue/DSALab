import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { EditorComponent } from './editor/editor.component';
import { EmptyPageComponent } from '../empty-page/empty-page.component';
import { BuildSettingComponent } from './settings/build-setting/build-setting.component';
import { SfbSettingComponent } from './settings/build-setting/sfb-setting/sfb-setting.component';
import { EnvSettingComponent } from './settings/build-setting/env-setting/env-setting.component';
import { SettingsGuard } from '../../services/settings.service';
import { EditorSettingComponent } from './settings/editor-setting/editor-setting.component';
import { ThemeSettingComponent } from './settings/editor-setting/theme-setting/theme-setting.component';

const routes: Routes = [
  {
    path: 'empty',
    component: EmptyPageComponent
  },
  {
    path: 'file/:key',
    component: EditorComponent
  },
  {
    path: 'setting/~build',
    component: BuildSettingComponent,
    children: [
      {
        path: '',
        canActivate: [SettingsGuard],
        component: EmptyPageComponent
      },
      {
        path: 'sfb',
        component: SfbSettingComponent
      },
      {
        path: 'env',
        component: EnvSettingComponent
      }
    ]
  },
  {
    path: 'setting/~editor',
    component: EditorSettingComponent,
    children: [
      {
        path: '',
        canActivate: [SettingsGuard],
        component: EmptyPageComponent
      },
      {
        path: 'theme',
        component: ThemeSettingComponent
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'empty'
  }
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsRoutingModule { }
