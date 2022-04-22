import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';

@Component({
  selector: 'app-nav-bar',
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.css']
})
export class NavBarComponent implements OnInit {
  // public selectedOrder!: String;

  @Output() newItemEvent = new EventEmitter<string>();

  constructor(private certificateInvoicingService: CertificateInvoicingService) { }

  ngOnInit(): void {
  }

  onOrderChange(orderNumber: string) {
    // this.selectedOrder = orderNumber;
    // this.certificateInvoicingService.update(orderNumber);
     console.log(orderNumber);

    this.newItemEvent.emit(orderNumber);
    //this.certificateInvoicingService.update(orderNumber);
    this.certificateInvoicingService.update(orderNumber);
  }
}
