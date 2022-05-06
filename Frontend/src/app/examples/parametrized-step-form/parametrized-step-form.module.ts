import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParametrizedStepFormComponent } from './parametrized-step-form.component';
import { FormManagerComponent } from './form-manager/form-manager.component';
import { ContactFormComponent } from './contact-form/contact-form.component';
import { CustomizationFormComponent } from './customization-form/customization-form.component';
import { PaymentFormComponent } from './payment-form/payment-form.component';
import { NextPageDirective } from './directives/next-page.directive';
import { PrevPageDirective } from './directives/prev-page.directive';
import { ManagedFormComponent } from './managed-form/managed-form.component';



@NgModule({
  declarations: [
    ParametrizedStepFormComponent,
    FormManagerComponent,
    ContactFormComponent,
    CustomizationFormComponent,
    PaymentFormComponent,
    NextPageDirective,
    PrevPageDirective,
    ManagedFormComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    ParametrizedStepFormComponent
  ]
})
export class ParametrizedStepFormModule { }
