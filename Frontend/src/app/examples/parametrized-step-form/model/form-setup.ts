import { FormControl, FormGroup } from "@angular/forms"
import { CertConfig, StepConfig } from "../types"
import { FormNavigation } from "./form-navigation"

const cfgProcessor = (form: FormGroup, configuration: CertConfig) => {
  Object.entries(configuration.steps).forEach(([name, step]) => {
    const stepForm = form.get(name) as FormGroup || new FormGroup({})
    Object.entries(step.fields).forEach(([name, field]) => {
            //fill missing fields from final formGroup based on configuration
            const initialValue = field.default === undefined ? '' : field.default
            const fieldControl = stepForm.get(name) as FormControl || new FormControl(initialValue)
            //add field validations for dynamic on-typing feedback 
            fieldControl.addValidators(field.validations)
            stepForm.addControl(name, fieldControl)
          })
    form.addControl(name, stepForm)
  })
}

export class FormSetup {
  readonly navigation: FormNavigation
  constructor(readonly certName: string, readonly form: FormGroup, readonly configuration: CertConfig) {
    cfgProcessor(form, configuration)
    this.navigation = new FormNavigation(this)
  }

  subform(name: string) {
    const subForm = this.form.get(name) as FormGroup || new FormGroup({})
    this.form.addControl(name, subForm)
    return subForm
  }

  getConfig(name: string): StepConfig {
    return this.configuration.steps[name]
  }
}