import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DynamicGridSampleComponent } from './examples/dynamic-grid-sample/dynamic-grid-sample.component';
import { FormLayoutSampleComponent } from './examples/form-layout-sample/form-layout-sample.component';
import { ReduxPageComponent } from './examples/redux/components/redux-page/redux-page.component';
import { StoreServiceSampleComponent } from './examples/store-service-sample/store-service-sample.component';
import { LoginSampleComponent } from './examples/login-sample/login-sample.component';
import { CertificateInvoicingSampleComponent } from './examples/certificate-invoicing-sample/certificate-invoicing-sample.component';
import { EntityDataComponent } from './examples/certificate-invoicing-sample/components/entity-data/entity-data.component';
import { IdentityValidationComponent } from './examples/certificate-invoicing-sample/components/identity-validation/identity-validation.component';
import { PaymentComponent } from './examples/certificate-invoicing-sample/components/payment/payment.component';
import { RepresentativeDataComponent } from './examples/certificate-invoicing-sample/components/representative-data/representative-data.component';

export const routes: Routes = [
  { path: 'form-layout-sample', component: FormLayoutSampleComponent },
  { path: 'redux', component: ReduxPageComponent },
  { path: 'store-service', component: StoreServiceSampleComponent },
  { path: 'login-sample', component: LoginSampleComponent },
  {
    path: "certificate-invoicing-sample",
    component: CertificateInvoicingSampleComponent,
    children: [
      { path: "", redirectTo: "payment", pathMatch: "full" },
      { path: "payment", component: PaymentComponent },
      { path: "representative-data", component: RepresentativeDataComponent },
      { path: "entity-data", component: EntityDataComponent },
      { path: "upload-doc", component: DynamicGridSampleComponent },
      { path: "identity-validation", component: IdentityValidationComponent },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
