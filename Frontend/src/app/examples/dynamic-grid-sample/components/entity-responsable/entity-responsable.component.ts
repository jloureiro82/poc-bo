import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';
import { EntityResponsableModel } from '../../models/EntityResponsableModel';
import { EntityResponsableService } from '../../services/entity-responsable/entity-responsable.service';

@Component({
  selector: 'app-entity-responsable',
  templateUrl: './entity-responsable.component.html',
  providers: [EntityResponsableService],
  styleUrls: ['./entity-responsable.component.css']
})
export class EntityResponsableComponent implements OnInit {
  entityResponsables: EntityResponsableModel[] = [];

  public store$ = this.certificateInvoicingService.getObserver();

  @Input()
  order!: String;

  constructor(private certificateInvoicingService: CertificateInvoicingService, 
    private entityResponsableService: EntityResponsableService) {console.log("Batata "+this.getRepresentative())}

  ngOnInit() {
    // this.entityResponsableService.setOrder("123");
    this.order = "123";
    console.log(this.getRepresentative())
    this.getRepresentative()
  }

  ngOnChanges() {
    console.log("Selected order: "+this.certificateInvoicingService.selectedOrder)
    if (this.order !== undefined) {
      // this.entityResponsableService.setOrder(this.order);
      this.getRepresentative();
    }
  }

  getRepresentative(): void {
    this.entityResponsableService
      .getEntityResponsable(this.order)
      .subscribe(entityResponsable => (
        entityResponsable !== undefined && entityResponsable.length > 0 ? this.entityResponsables = entityResponsable : this.entityResponsables = []
      ))
  }

  getDocAuthenticationText(isAuthenticated: Boolean): String {
    if (isAuthenticated) {
      return 'Autenticado'
    } else {
      return 'Não Autenticado'
    }
  }
}
