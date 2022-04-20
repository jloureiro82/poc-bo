import { Component, Input, OnInit, SimpleChange, SimpleChanges } from '@angular/core';
import { RepresentativeModel } from '../../models/RepresentativeModel';
import { RepresentativeService } from '../../services/representative/representative.service';

@Component({
  selector: 'app-representative',
  templateUrl: './representative.component.html',
  styleUrls: ['./representative.component.css']
})
export class RepresentativeComponent implements OnInit {
  representatives: RepresentativeModel[] = [];

  constructor(private representativeService: RepresentativeService) { }

  @Input()
  order!: String;

  ngOnInit() {
    this.representativeService.setOrder("123");
    this.getRepresentative()
  }

  ngOnChanges() {
    if(this.order != undefined){
      this.representativeService.setOrder(this.order);
      this.getRepresentative();
    }
  }

  getRepresentative(): void {
    this.representativeService.getRepresentative().subscribe(representative => (this.representatives = representative))
  }

  getDocAuthenticationText(isAuthenticated: Boolean) {
    if(isAuthenticated) {
      return "Autenticado"
    }

    return "Não Autenticado"
  }
}
