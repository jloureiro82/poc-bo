import { Directive, Input, TemplateRef } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective {

  @Input('formStep') form!: FormGroup

  constructor(public templateRef: TemplateRef<any>) { }

  field(name: string) {
    const field = this.form?.get(name) as FormControl || new FormControl('')
    this.form?.setControl(name, field)
    return field
  }

  addValidation(fieldName: string, validator: ValidatorFn) {
    this.field(fieldName).addValidators(validator)
  }
  
}
