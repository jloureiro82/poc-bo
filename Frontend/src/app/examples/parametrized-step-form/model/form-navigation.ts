import { CertConfig, StepConfig } from "../types"
import { BehaviorSubject } from 'rxjs'
import { FormSetup } from "./form-setup"

export class FormNavigation {

  private step: StepConfig
  private configuration: CertConfig
  private changeEmitter = new BehaviorSubject(this)

  constructor(setup: FormSetup) {
    this.configuration = setup.configuration
    const first = setup.configuration.sequence[0]
    this.step = setup.configuration.steps[first]
    this.changeEmitter.next(this)
  }

  pageId() {
    return this.step.name
  }

  index() {
    return this.configuration.sequence.indexOf(this.step.name)
  }

  prev() {
    return this.configuration.sequence[this.index() - 1]
  }

  next() {
    return this.configuration.sequence[this.index() + 1]
  }
  
  gotoStep(stepName: string) {
    const goto = this.configuration.steps[stepName]
    if (goto) {
      this.step = goto
      this.changeEmitter.next(this)
    }
  }

  changeObservable() {
    return this.changeEmitter.asObservable()
  }
}