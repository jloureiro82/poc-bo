import { AfterContentInit, Component, ContentChildren, Input, QueryList } from '@angular/core';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-multi-step-form',
  templateUrl: './multi-step-form.component.html',
  styleUrls: ['./multi-step-form.component.css']
})
export class MultiStepFormComponent implements AfterContentInit {

  @ContentChildren(FormStepDirective) steps!: QueryList<FormStepDirective>
  @Input('submit') submit = () => {}
  public stepIndex = 0
  public valid = true
  constructor() { }

  ngAfterContentInit(): void {
    //todo
    this.steps.forEach(step => step)
  }

  getStepTemplate() {
    return this.steps.get(this.stepIndex)?.templateRef || null
  }

  isLastStep() {
    return (this.stepIndex +1) === this.steps.length
  }

  nextStep() {
    const step = this.steps.get(this.stepIndex)
    if (step?.form.valid) {
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

  doSubmit() {
    this.submit()
  }
}
