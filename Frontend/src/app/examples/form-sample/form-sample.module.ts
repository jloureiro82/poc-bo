import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormSampleComponent } from './form-sample.component';
import { Step1Component } from './step1/step1.component';
import { Step2Component } from './step2/step2.component';
import { Step3Component } from './step3/step3.component';
import { FormInputComponent } from './form-input/form-input.component';
import { MultiStepFormComponent } from './multi-step-form/multi-step-form.component';
import { FormStepDirective } from './directives/form-step.directive';
import { ReactiveFormsModule } from '@angular/forms';
import { FormDropdownComponent } from './form-dropdown/form-dropdown.component';



@NgModule({
  declarations: [
    FormSampleComponent,
    Step1Component,
    Step2Component,
    Step3Component,
    FormInputComponent,
    MultiStepFormComponent,
    FormStepDirective,
    FormDropdownComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  exports: [
    FormSampleComponent
  ]
})
export class FormSampleModule { }
