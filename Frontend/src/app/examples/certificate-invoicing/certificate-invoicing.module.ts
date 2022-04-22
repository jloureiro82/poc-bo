import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CertificateInvoicingComponent } from './certificate-invoicing.component';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
import { RepresentativeComponent } from './components/representative/representative.component';
import { AppRoutingModule } from 'src/app/app-routing.module';



@NgModule({
  declarations: [ 
    CertificateInvoicingComponent, 
    NavBarComponent, RepresentativeComponent
  ],
  imports: [
    CommonModule,
    AppRoutingModule
  ],
  exports: [ CertificateInvoicingComponent ]
})
export class CertificateInvoicingModule { }
