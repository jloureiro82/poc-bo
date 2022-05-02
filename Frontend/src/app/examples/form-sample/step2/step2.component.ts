import { Component, Input, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-step2',
  templateUrl: './step2.component.html',
  styleUrls: ['./step2.component.css']
})
export class Step2Component {

  @Input('form') form!: FormGroup

  genders = [
    {id: 'male', name: 'Male'},
    {id: 'female', name: 'Female'},
    {id: 'other', name: 'Other'}
  ]

  languages = [
    {id: 'english', name: 'English'},
    {id: 'france', name: 'France'},
    {id: 'vietnamese', name: 'Vietnamese'},
  ]
  constructor() { }

  field(name: string) {
    const field = this.form?.get(name) as FormControl || new FormControl('')
    this.form?.setControl(name, field)
    return field
  }
}
