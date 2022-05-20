import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MultistepComponent } from './multistep.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { FormComponent } from './components/form/form.component';
import {MatStepperModule} from '@angular/material/stepper';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatListModule} from '@angular/material/list';
import { Form2Component } from './components/form2/form2.component';
import { Form3Component } from './components/form3/form3.component';



@NgModule({
  declarations: [
    MultistepComponent,
    FormComponent,
    Form2Component,
    Form3Component
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatStepperModule,
    MatInputModule,
    MatButtonModule,
    MatListModule
  ],
  exports: [
    MultistepComponent,
    FormComponent,
    Form2Component,
    Form3Component
  ]
})
export class MultistepModule { }
