import { Component, OnInit } from '@angular/core';
import { ValidatorFn } from '@angular/forms';
import { FormStepDirective } from '../directives/form-step.directive';

const Validator:ValidatorFn = (control) => {
  if (control.value === 'invalid') return {invalid: 'value is invalid... literally'}
  return null
}

@Component({
  selector: 'app-contact-form',
  templateUrl: './contact-form.component.html',
  styleUrls: ['./contact-form.component.css']
})
export class ContactFormComponent implements OnInit {

  public isCardIncluded = false

  constructor(private form: FormStepDirective) { }

  ngOnInit(): void { }

  showField(name: string) {
    const field = this.form.getField(name)
    return !!field
  }

  getField(name: string) {
    return this.form.getField(name)
  }

  toogleIncludeCard(flag: boolean) {
    this.isCardIncluded = flag
    this.getField('cardIncluded').setValue(flag)
    const field = this.getField('cardField')
    const fieldConfig = this.form.getFieldConfig('cardField')
    if (flag) {
      field.addValidators(fieldConfig.validations)
    } else {
      field.removeValidators(fieldConfig.validations)
    }
    field.updateValueAndValidity()
  }

  toogleValidation() {
    const field = this.getField('fieldA')
    if (field.hasValidator(Validator)) {
      field.removeValidators(Validator)
    } else {
      field.addValidators(Validator)
    }
    field.updateValueAndValidity()
  }
}
