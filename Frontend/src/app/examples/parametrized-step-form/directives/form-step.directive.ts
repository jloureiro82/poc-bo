import { Directive, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import { ManagedFormComponent } from '../managed-form/managed-form.component';
import { StepConfig } from '../types';

export interface FormConfig {
  [key: string]: ValidatorFn[]
}

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective implements OnInit {

  @Input('formStep') stepName!: string

  private config!: StepConfig
  private subform!: FormGroup

  constructor(private managedForm: ManagedFormComponent) { }

  ngOnInit(): void {
    this.config = this.managedForm.formSetup.getConfig(this.stepName)
    this.subform = this.managedForm.formSetup.subform(this.stepName)
  }

  getField(name: string) {
    return this.subform.get(name) as FormControl
  }

  hasField(name: string) {
    return !!this.config.fields[name]
  }

  getFieldConfig(name: string) {
    return this.config.fields[name]
  }
}