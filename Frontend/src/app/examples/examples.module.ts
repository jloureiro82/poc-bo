import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutSampleModule } from './form-layout-sample/form-layout-sample.module';
import { ReduxModule } from './redux/redux.module';
import { StoreServiceSampleModule } from './store-service-sample/store-service-sample.module';
import { DynamicGridSampleModule } from './dynamic-grid-sample/dynamic-grid-sample.module';
import { LoginSampleModule } from './login-sample/login-sample.module';
import { CertificateInvoicingSampleModule } from './certificate-invoicing-sample/certificate-invoicing-sample.module';
import { FormSampleModule } from './form-sample/form-sample.module';
import { InternationalizationSampleComponent } from './internationalization-sample/internationalization-sample.component';
import { InternationalizationSampleModule } from './internationalization-sample/internationalization-sample.module';
import { ParametrizedStepFormModule } from './parametrized-step-form/parametrized-step-form.module';

@NgModule({
  declarations: [
    
  ],
  imports: [
    CommonModule,
    FormLayoutSampleModule,
    ReduxModule,
    StoreServiceSampleModule,
    DynamicGridSampleModule,
    LoginSampleModule,
    CertificateInvoicingSampleModule,
    FormSampleModule,
    InternationalizationSampleModule,
    ParametrizedStepFormModule,
  ]
})
export class ExamplesModule { }
