import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CertificateInvoicingSampleComponent } from './certificate-invoicing-sample.component';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
import { CertificateInvoicingSampleRoutingModule } from './certificate-invoicing-sample-routing.module';


@NgModule({
  declarations: [
    CertificateInvoicingSampleComponent,
    NavBarComponent
  ],
  imports: [
    CommonModule,
    CertificateInvoicingSampleRoutingModule
  ]
})
export class CertificateInvoicingSampleModule { }
