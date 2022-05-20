import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MultistepRouterRoutingModule } from './multistep-router-routing.module';
import { MultistepRouterComponent } from './multistep-router.component';
import { Form1Component } from './components/form1/form1.component';
import { Form2Component } from './components/form2/form2.component';
import { ReactiveFormsModule } from '@angular/forms';


@NgModule({
  declarations: [
    MultistepRouterComponent,
    Form1Component,
    Form2Component
  ],
  imports: [
    CommonModule,
    MultistepRouterRoutingModule,
    ReactiveFormsModule 
  ],
  exports: [
    MultistepRouterComponent,
    Form1Component,
    Form2Component
  ]
})
export class MultistepRouterModule { }
