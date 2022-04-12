import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutSampleModule } from './form-layout-sample/form-layout-sample.module';
import { ReduxModule } from './redux/redux.module';
import { StoreServiceSampleModule } from './store-service-sample/store-service-sample.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormLayoutSampleModule,
    ReduxModule,
    StoreServiceSampleModule
  ]
})
export class ExamplesModule { }
