import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutSampleComponent } from './form-layout-sample.component';
import { SharedModule } from 'src/app/shared/shared.module';



@NgModule({
  declarations: [
    FormLayoutSampleComponent
  ],
  imports: [
    CommonModule,
    SharedModule
  ],
  exports: [
    FormLayoutSampleComponent
  ]
})
export class FormLayoutSampleModule { }
