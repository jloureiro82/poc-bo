import { Component, Input, OnInit } from '@angular/core';
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

  @Input()
  order!: String;

  constructor(private entityResponsableService: EntityResponsableService) {}

  ngOnInit() {
    this.entityResponsableService.setOrder("123");
    this.getRepresentative()
  }

  ngOnChanges() {
    if (this.order !== undefined) {
      this.entityResponsableService.setOrder(this.order);
      this.getRepresentative();
    }
  }

  getRepresentative(): void {
    this.entityResponsableService
      .getEntityResponsable()
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
