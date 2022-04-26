import { Component, Input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-step1',
  templateUrl: './step1.component.html',
  styleUrls: ['./step1.component.css']
})
export class Step1Component {
  
  @Input('form') form!: FormGroup

  constructor() { }

  field(name: string) {
    const field = this.form?.get(name) as FormControl || new FormControl('')
    this.form?.setControl(name, field)
    return field
  }
}
