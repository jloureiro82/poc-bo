import { AfterContentInit, Component, ContentChildren, QueryList } from '@angular/core';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-multi-step-form',
  templateUrl: './multi-step-form.component.html',
  styleUrls: ['./multi-step-form.component.css']
})
export class MultiStepFormComponent implements AfterContentInit {

  @ContentChildren(FormStepDirective) steps!: QueryList<FormStepDirective>
  public stepIndex = 0
  constructor() { }

  ngAfterContentInit(): void {
    this.steps.forEach(step => step)
  }

  getStepTemplate() {
    return this.steps.get(this.stepIndex)?.templateRef || null
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
