import { Component, OnInit } from '@angular/core';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';

@Component({
  selector: 'app-certificate-invoicing',
  templateUrl: './certificate-invoicing.component.html',
  providers: [CertificateInvoicingService],
  styleUrls: ['./certificate-invoicing.component.css']
})
export class CertificateInvoicingComponent implements OnInit {
   public selectedOrder: String = 'asdasdasfadfgge324'

  constructor(private certInvoicingService: CertificateInvoicingService) { }

  ngOnInit(): void {
  }

  passEvent(_event: string){
    //aqui vem os order id
    console.log("asdasdasdasd_"+_event);
    // this.certInvoicingService.update(_event);
      }
}
