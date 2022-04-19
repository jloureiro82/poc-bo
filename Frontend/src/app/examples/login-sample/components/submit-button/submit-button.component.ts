import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-submit-button',
  templateUrl: './submit-button.component.html',
  styleUrls: ['./submit-button.component.css']
})
export class SubmitButtonComponent implements OnInit {

  @Output('click') click = new EventEmitter<void>();
  @Input('title') title = 'Login'
  constructor() { }

  ngOnInit(): void {
  }

  doClick() {
    this.click.next()
  }
}
