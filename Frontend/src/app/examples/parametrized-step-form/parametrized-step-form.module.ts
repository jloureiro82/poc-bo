import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParametrizedStepFormComponent } from './parametrized-step-form.component';
import { ContactFormComponent } from './contact-form/contact-form.component';
import { CustomizationFormComponent } from './customization-form/customization-form.component';
import { PaymentFormComponent } from './payment-form/payment-form.component';
import { NextPageDirective } from './directives/next-page.directive';
import { PrevPageDirective } from './directives/prev-page.directive';
import { ManagedFormComponent } from './managed-form/managed-form.component';
import { FormStepDirective } from './directives/form-step.directive';
import { StepFieldDirective } from './directives/step-field.directive';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldOptionDirective } from './directives/field-option.directive';



@NgModule({
  declarations: [
    ParametrizedStepFormComponent,
    ContactFormComponent,
    CustomizationFormComponent,
    PaymentFormComponent,
    NextPageDirective,
    PrevPageDirective,
    ManagedFormComponent,
    FormStepDirective,
    StepFieldDirective,
    FieldOptionDirective
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  exports: [
    ParametrizedStepFormComponent
  ]
})
export class ParametrizedStepFormModule { }
