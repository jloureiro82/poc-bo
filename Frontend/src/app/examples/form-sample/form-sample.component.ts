import { Component } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-form-sample',
  templateUrl: './form-sample.component.html',
  styleUrls: ['./form-sample.component.css']
})
export class FormSampleComponent {

  public group = new FormGroup({})

  constructor() { }

  submit(payload: any) {
    console.log(JSON.stringify(payload, null, 2))
  }
}
