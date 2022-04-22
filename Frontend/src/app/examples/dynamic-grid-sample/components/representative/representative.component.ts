import { Component, Input, OnInit } from '@angular/core';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';
import { RepresentativeModel } from '../../models/RepresentativeModel';
import { RepresentativeService } from '../../services/representative/representative.service';

@Component({
  selector: 'app-representative',
  templateUrl: './representative.component.html',
  styleUrls: ['./representative.component.css']
})
export class RepresentativeComponent implements OnInit {
  representatives: RepresentativeModel[] = [];
  
  @Input()
  order!: String;

  constructor(private representativeService: RepresentativeService, 
    private certificateInvoicingService: CertificateInvoicingService) {}


  ngOnInit() {
    this.order ='123'
    this.getRepresentative()
  }

  ngOnChanges() {
    this.certificateInvoicingService.selectedOrder.subscribe((orderId) => {
      this.order = orderId;
      this.getRepresentative();
    });
  }

  getRepresentative(): void {
      this.representativeService
        .getRepresentative(this.order)
        .subscribe(representative => (this.representatives = representative))
  }

  getDocAuthenticationText(isAuthenticated: Boolean) {
    if (isAuthenticated) {
      return "Autenticado"
    }

    return "Não Autenticado"
  }
}
