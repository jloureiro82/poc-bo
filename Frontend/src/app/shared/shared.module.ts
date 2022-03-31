import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutModule } from './form-layout/form-layout.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormLayoutModule
  ],
  exports: [
    FormLayoutModule
  ]
})
export class SharedModule { }
