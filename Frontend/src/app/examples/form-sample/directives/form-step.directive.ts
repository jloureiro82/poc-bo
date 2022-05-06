import { Directive, Input, OnInit, Optional, TemplateRef } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import { MultiStepFormComponent } from '../multi-step-form/multi-step-form.component';

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective implements OnInit {

  @Input('formStep') formStep = 'default'
  private form!: FormGroup

  constructor(public templateRef: TemplateRef<any>, private mainform: MultiStepFormComponent) { }

  ngOnInit(): void {
    this.form = this.mainform.getForm(this.formStep)
  }

  field(name: string) {
    const field = this.form?.get(name) as FormControl || new FormControl('')
    this.form?.setControl(name, field)
    return field
  }

  addValidation(fieldName: string, validator: ValidatorFn) {
    this.field(fieldName).addValidators(validator)
  }
  
  isValid() {
    return this.form.valid
  }
}
