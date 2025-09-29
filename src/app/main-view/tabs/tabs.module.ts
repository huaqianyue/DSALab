import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { AppRoutingModule } from '../../app-routing.module';

import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { MonacoEditorModule } from '@materia-ui/ngx-monaco-editor';

import { TabsComponent } from './tabs/tabs.component';
import { EditorComponent } from './editor/editor.component';
import { BuildSettingComponent } from './settings/build-setting/build-setting.component';
import { SfbSettingComponent } from './settings/build-setting/sfb-setting/sfb-setting.component';
import { EnvSettingComponent } from './settings/build-setting/env-setting/env-setting.component';

import { EditorSettingComponent } from './settings/editor-setting/editor-setting.component';
import { ThemeSettingComponent } from './settings/editor-setting/theme-setting/theme-setting.component';
import { NzTagModule } from 'ng-zorro-antd/tag';

@NgModule({
  declarations: [
    TabsComponent, EditorComponent,
    BuildSettingComponent, SfbSettingComponent, EnvSettingComponent,
    EditorSettingComponent, ThemeSettingComponent
  ],
  imports: [
    CommonModule,
    AppRoutingModule,
    FormsModule,
    DragDropModule,
    NzTabsModule,
    NzLayoutModule,
    NzGridModule,
    NzMenuModule,
    NzButtonModule,
    NzSelectModule,
    NzCheckboxModule,
    NzRadioModule,
    NzTagModule,
    NzInputModule,
    NzModalModule,
    NzAlertModule,
    NzIconModule,
    MonacoEditorModule
  ],
  exports: [TabsComponent]
})
export class TabsModule { }
