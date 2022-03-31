import { Component, ContentChild, OnInit } from '@angular/core';
import { MainViewDirective } from '../../directive/main-view.directive';
import { SideViewDirective } from '../../directive/side-view.directive';

@Component({
  selector: 'app-form-layout',
  templateUrl: './form-layout.component.html',
  styleUrls: ['./form-layout.component.css']
})
export class FormLayoutComponent implements OnInit {

  @ContentChild(MainViewDirective) mainView!: MainViewDirective
  @ContentChild(SideViewDirective) sideView!: SideViewDirective

  constructor() { }

  ngOnInit(): void {
  }

}
