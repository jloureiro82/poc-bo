import { Component, OnInit } from '@angular/core';
import { RepresentativeModel } from 'src/app/shared/dynamic-grid/models/RepresentativeModel';
import { RepresentativeService } from '../../services/representative/representative.service';

@Component({
  selector: 'app-representative',
  templateUrl: './representative.component.html',
  styleUrls: ['./representative.component.css']
})
export class RepresentativeComponent implements OnInit {
  representatives: RepresentativeModel[] = [];

  constructor(private representativeService: RepresentativeService) { }

  ngOnInit() {
    this.getRepresentative()
  }

  getRepresentative(): void {
    this.representativeService.getRepresentative().subscribe(representative => (this.representatives = representative))
  }

  authenticated(authenticated: Boolean) {
    if(authenticated) {
      return "Autenticado"
    }

    return "Não Autenticado"
  }
}
