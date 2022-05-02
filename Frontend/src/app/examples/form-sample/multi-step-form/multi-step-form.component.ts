import { Component, ContentChildren, EventEmitter, Output, QueryList } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-multi-step-form',
  templateUrl: './multi-step-form.component.html',
  styleUrls: ['./multi-step-form.component.css']
})
export class MultiStepFormComponent {

  @ContentChildren(FormStepDirective) steps!: QueryList<FormStepDirective>
  mainForm = new FormGroup({})
  @Output('submit') submit = new EventEmitter()

  public stepIndex = 0
  public valid = true

  constructor() { }

  getStepTemplate() {
    return this.steps.get(this.stepIndex)?.templateRef || null
  }

  isLastStep() {
    return (this.stepIndex +1) === this.steps.length
  }

  nextStep() {
    const step = this.steps.get(this.stepIndex)
    if (step?.isValid()) {
      this.valid = true
      this.stepIndex += 1
    } else {
      this.valid = false
    }
  }

  backStep() {
    this.stepIndex -= 1
  }

  getProgress() {
    return (this.stepIndex+1) / this.steps.length
  }

  getForm(groupName: string) {
    const group = this.mainForm.get(groupName) as FormGroup || new FormGroup({})
    this.mainForm.addControl(groupName, group)
    return group
  }

  doSubmit() {
    this.submit.emit(this.mainForm.value)
  }
}
