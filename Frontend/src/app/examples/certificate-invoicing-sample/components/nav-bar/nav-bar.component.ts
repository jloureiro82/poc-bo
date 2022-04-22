import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';
import { BehaviorSubject } from 'rxjs';

@Component({
  selector: 'app-nav-bar',
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.css']
})
export class NavBarComponent implements OnInit {

  constructor(private certificateInvoicingService: CertificateInvoicingService) { }

  ngOnInit(): void {
  }

  onOrderChange(orderNumber: string) {
     this.certificateInvoicingService.setSelectedOrder(orderNumber);
  }
}
