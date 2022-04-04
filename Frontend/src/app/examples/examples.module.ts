import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutSampleModule } from './form-layout-sample/form-layout-sample.module';
import { ReduxModule } from './redux/redux.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormLayoutSampleModule,
    ReduxModule
  ]
})
export class ExamplesModule { }
