import { Component, EventEmitter, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-submit-button',
  templateUrl: './submit-button.component.html',
  styleUrls: ['./submit-button.component.css']
})
export class SubmitButtonComponent implements OnInit {

  @Output('click') click = new EventEmitter<string>();
  constructor() { }

  ngOnInit(): void {
  }

}
