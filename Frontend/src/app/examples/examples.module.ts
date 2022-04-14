import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutSampleModule } from './form-layout-sample/form-layout-sample.module';
import { ReduxModule } from './redux/redux.module';
import { StoreServiceSampleModule } from './store-service-sample/store-service-sample.module';
import { DynamicGridSampleModule } from './dynamic-grid-sample/dynamic-grid-sample.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormLayoutSampleModule,
    ReduxModule,
    StoreServiceSampleModule,
    DynamicGridSampleModule
  ]
})
export class ExamplesModule { }
