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

  echoform(groupName: string) {
    const group = this.group.get(groupName) as FormGroup || new FormGroup({})
    this.group.addControl(groupName, group)
    return group
  }

  submit() {
    return () => console.log(JSON.stringify(this.group.value, null, 2))
  }
}
