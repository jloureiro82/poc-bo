import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntityResponsableComponent } from './components/entity-responsable/entity-responsable.component';
import { RepresentativeComponent } from './components/representative/representative.component';
import { StatusComponent } from './components/status/status.component';
import { DynamicGridSampleComponent } from './dynamic-grid-sample.component';
import { SharedModule } from 'src/app/shared/shared.module';




@NgModule({
  declarations: [
    DynamicGridSampleComponent,
    EntityResponsableComponent,
    RepresentativeComponent,
    StatusComponent
  ],
  imports: [
    CommonModule,
    SharedModule
  ],
  exports: [
    DynamicGridSampleComponent
  ]
})
export class DynamicGridSampleModule { }
