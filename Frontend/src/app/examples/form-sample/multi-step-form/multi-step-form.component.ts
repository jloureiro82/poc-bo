import { AfterContentInit, Component, ContentChildren, EventEmitter, Output, QueryList } from '@angular/core';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-multi-step-form',
  templateUrl: './multi-step-form.component.html',
  styleUrls: ['./multi-step-form.component.css']
})
export class MultiStepFormComponent {

  @ContentChildren(FormStepDirective) steps!: QueryList<FormStepDirective>
  public stepIndex = 0

  constructor() { }

  getStepTemplate() {
    return this.steps.get(this.stepIndex)?.templateRef || null
  }

  getTitleOf(index: number) {
    return this.steps.get(index)?.title || null
  }
  isLastStep() {
    return (this.stepIndex +1) === this.steps.length
  }

  nextStep() {
    this.stepIndex += 1
  }

  backStep() {
    this.stepIndex -= 1
  }

  getProgress() {
    return (this.stepIndex+1) / this.steps.length
  }
}
