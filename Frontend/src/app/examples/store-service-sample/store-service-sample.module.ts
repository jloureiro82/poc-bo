import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreServiceSampleComponent } from './store-service-sample.component';
import { SharedModule } from 'src/app/shared/shared.module';
import { SideViewComponent } from './side-view/side-view.component';



@NgModule({
  declarations: [
    StoreServiceSampleComponent,
    SideViewComponent
  ],
  imports: [
    CommonModule,
    SharedModule
  ],
  exports: [
    StoreServiceSampleComponent
  ]
})
export class StoreServiceSampleModule { }
