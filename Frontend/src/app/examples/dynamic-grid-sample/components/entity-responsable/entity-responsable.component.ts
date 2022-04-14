import { Component, OnInit } from '@angular/core';
import { EntityResponsableModel } from 'src/app/shared/dynamic-grid/models/EntityResponsableModel';
import { EntityResponsableService } from '../../services/entity-responsable/entity-responsable.service';

@Component({
  selector: 'app-entity-responsable',
  templateUrl: './entity-responsable.component.html',
  providers: [EntityResponsableService],
  styleUrls: ['./entity-responsable.component.css']
})
export class EntityResponsableComponent implements OnInit {
  entityResponsables: EntityResponsableModel[] = [];

  constructor(private entityResponsableService: EntityResponsableService) { }

  ngOnInit() {
    this.getRepresentative()
  }

  getRepresentative(): void {
    this.entityResponsableService.getEntityResponsable().subscribe(entityResponsable => (this.entityResponsables = entityResponsable))
  }

  authenticated(authenticated: Boolean): String {
    if(authenticated) {
      return 'Autenticado'
    } else {
      return 'Não Autenticado'
    }
  }
}
