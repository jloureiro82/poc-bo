import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { EntityResponsableService } from './services/entity-responsable/entity-responsable.service';
import { RepresentativeService } from './services/representative/representative.service';

@Component({
  selector: 'app-dynamic-grid-sample',
  templateUrl: './dynamic-grid-sample.component.html',
  styleUrls: ['./dynamic-grid-sample.component.css']
})
export class DynamicGridSampleComponent implements OnInit {

  public selectedOrder!: String;

  constructor(private representativeService: RepresentativeService,
    private entityResponsableService: EntityResponsableService) { }

  ngOnInit(): void {
  }

  onOrderChange(orderNumber: String) {
    this.selectedOrder = orderNumber;
  }

}
