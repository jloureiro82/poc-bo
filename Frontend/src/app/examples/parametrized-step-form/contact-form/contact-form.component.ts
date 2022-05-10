import { Component, OnInit } from '@angular/core';
import { FormConfig, FormStepDirective } from '../directives/form-step.directive';



const REQUIRED_FIELDS: FormConfig = {
  reqFieldA: [],
  reqFieldB: [],
  reqFieldC: []
}

@Component({
  selector: 'app-contact-form',
  templateUrl: './contact-form.component.html',
  styleUrls: ['./contact-form.component.css']
})
export class ContactFormComponent implements OnInit {

  public mustValidate = false
  constructor(private form: FormStepDirective) { }
  private OPTIONAL_FIELDS: FormConfig = {
    fieldA: [(control) => {
      if (!this.mustValidate) return null
      if (control.value === 'invalid') return {invalid: 'value is invalid... literally'}
      return null
    }],
    fieldB: [],
    fieldC: []
  }
  ngOnInit(): void {
    this.form.formSetup(REQUIRED_FIELDS, this.OPTIONAL_FIELDS)
    console.log('oninit', this.form)
  }

  showField(name: string) {
    const field = this.form.getField(name)
    return !!field
  }
  getField(name: string) {
    return this.form.getField(name)
  }

  toogleValidation() {
    this.mustValidate = !this.mustValidate
    this.getField('fieldA').updateValueAndValidity()
    console.log('toogle for', this.mustValidate)
  }
  revalidate() {
    this.form.recalculate()
  }
}
