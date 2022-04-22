import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CertificateInvoicingService } from 'src/app/shared/certificate-invoicing/certificate-invoicing.service';
import { EntityResponsableModel } from '../../models/EntityResponsableModel';
import { EntityResponsableService } from '../../services/entity-responsable/entity-responsable.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-entity-responsable',
  templateUrl: './entity-responsable.component.html',
  providers: [EntityResponsableService],
  styleUrls: ['./entity-responsable.component.css']
})
export class EntityResponsableComponent implements OnInit {
  entityResponsables: EntityResponsableModel[] = [];

  @Input()
  order!: String;
  isEndpointReturnedError: boolean = false;

  constructor(private entityResponsableService: EntityResponsableService) {}

  ngOnInit() {
    this.order = "123";
    this.getRepresentative()
  }

  ngOnChanges() {
    if (this.order !== undefined) {
      this.getRepresentative();
    }
  }

  getRepresentative(): void {
    try{
      this.entityResponsableService
        .getEntityResponsable(this.order)
        .subscribe(entityResponsable => (
          entityResponsable !== undefined && entityResponsable.length > 0 ? this.entityResponsables = entityResponsable : this.entityResponsables = []
        ))
    } catch (error) { 
      console.log(error)
      this.isEndpointReturnedError = true;
    }
  }

  getDocAuthenticationText(isAuthenticated: Boolean): String {
    if (isAuthenticated) {
      return 'Autenticado'
    } else {
      return 'Não Autenticado'
    }
  }
}
