import { Directive, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import { ManagedFormComponent } from '../managed-form/managed-form.component';

export interface FormConfig {
  [key: string]: ValidatorFn[]
}

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective implements OnInit{

  @Input('formStep') stepName!: string

  private config!: Form
  private subform!: FormGroup

  constructor(private managedForm: ManagedFormComponent) { }

  ngOnInit(): void {
    this.config = this.managedForm.getConfig(this.stepName)
    this.subform = this.managedForm.subForm(this.config.name)
  }

  formSetup(requiredFields: FormConfig, optionalFields: FormConfig) {
    Object.entries(requiredFields).forEach(([key, validators]) => {
      this.fieldSetup(key, validators)
    })
    Object.entries(optionalFields).forEach(([key, validators]) => {
      if (this.config.fields.includes(key)) {
        this.fieldSetup(key, validators)
      }
    })
  }

  getField(name: string) {
    return this.subform.get(name) as FormControl
  }

  private fieldSetup(name: string, validatiors: ValidatorFn[]) {
    let field = this.subform.get(name)
    if (!field) {
      field = new FormControl('')
    }
    field.addValidators(validatiors)
    this.subform.addControl(name, field)
  }
}