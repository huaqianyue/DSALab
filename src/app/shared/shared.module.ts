import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HowlerAudioPlayerComponent } from './components/howler-audio-player/howler-audio-player.component';

@NgModule({
  declarations: [
    HowlerAudioPlayerComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    HowlerAudioPlayerComponent
  ]
})
export class SharedModule { }
