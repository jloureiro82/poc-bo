import { Component, OnInit } from '@angular/core';
import { FormConfig, FormStepDirective } from '../directives/form-step.directive';

const OPTIONAL_FIELDS: FormConfig = {
  fieldA: [],
  fieldB: [],
  fieldC: []
}

const REQUIRED_FIELDS: FormConfig = {
  reqFieldA: [],
  reqFieldC: []
}

@Component({
  selector: 'app-customization-form',
  templateUrl: './customization-form.component.html',
  styleUrls: ['./customization-form.component.css']
})
export class CustomizationFormComponent implements OnInit {

  constructor(private form: FormStepDirective) { }

  ngOnInit(): void {
    this.form.formSetup(REQUIRED_FIELDS, OPTIONAL_FIELDS)
    console.log('oninit', this.form)
  }

  showField(name: string) {
    const field = this.form.getField(name)
    return !!field
  }
  getField(name: string) {
    return this.form.getField(name)
  }
}
