import { Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators, } from '@angular/forms';
import { BehaviorSubject, map, of, tap, zipWith } from 'rxjs'
import { CertConfig, CertTypesConfig, StepConfig } from '../types';

const certTypesConfig: CertTypesConfig = {
  'type A': {
    sequence: ['contact', 'customization', 'payment'],
    steps: {
      contact: {
        name: 'contact',
        validations: [],
        fields: {
          fieldA: {validations: [Validators.required]},
          fieldB: {validations: []},
          fieldC: {validations: []},
          reqFieldA: {validations: []},
          reqFieldB: {validations: []},
          reqFieldC: {validations: []},
          optionField: {validations: [], options: ['optionA', 'optionB']},
          cardIncluded: {validations: []},
          cardField: {validations: [Validators.required]},
        }
      },
      customization: {
        name: 'customization',
        validations: [],
        fields: {}
      },
      payment: {
        name: 'payment',
        validations: [],
        fields: {}
      }
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class ConfigStoreService {

  constructor() { }

  getCertForm(certName: string) {
    return of(certTypesConfig[certName] || {name: 'default', forms: []})
  }

  loadPrefilledForm(type: string) {
    return of({})
  }

  jsonToFormGroup(json: object) {
    return new FormGroup({})
  }

  getFormSetup(certName: string) {
    //get configuration
    return this.getCertForm(certName).pipe(
      zipWith(
        //load preview json form from backend/storage
        this.loadPrefilledForm(certName)
        //convert json to formGroup
        .pipe(map(this.jsonToFormGroup))
    ),
    map(([configuration, form]) => new FormSetup(certName, form, configuration)),
  )
  //return FormSetup with formGroup pre-filled and dynamic validations to be injected into html forms
  }
}

const cfgProcessor = (form: FormGroup, configuration: CertConfig) => {
  Object.entries(configuration.steps).forEach(([name, step]) => {
    const stepForm = form.get(name) as FormGroup || new FormGroup({})
    Object.entries(step.fields).forEach(([name, field]) => {
            //fill missing fields from final formGroup based on configuration
            const fieldControl = stepForm.get(name) as FormControl || new FormControl('')
            //add field validations for dynamic on-typing feedback 
            fieldControl.addValidators(field.validations)
            stepForm.addControl(name, fieldControl)
          })
          form.addControl(name, stepForm)
  })
}

export class FormNavigation {

  private step: StepConfig
  private changeEmitter = new BehaviorSubject(this)

  constructor(private setup: FormSetup) {
    const first = setup.configuration.sequence[0]
    this.step = setup.configuration.steps[first]
  }

  pageId() {
    return this.step.name
  }

  subForm(name: string) {
    const subForm = this.setup.form.get(name) as FormGroup || new FormGroup({})
    this.setup.form.addControl(name, subForm)
    return subForm
  }

  index() {
    return this.setup.configuration.sequence.indexOf(this.step.name)
  }

  prev() {
    return this.setup.configuration.sequence[this.index() - 1]
  }

  next() {
    return this.setup.configuration.sequence[this.index() + 1]
  }
  
  gotoStep(stepName: string) {
    const goto = this.setup.configuration.steps[stepName]
    if (goto) {
      this.step = goto
      this.changeEmitter.next(this)
    }
  }

  changeObservable() {
    return this.changeEmitter.asObservable()
  }
}

export class FormSetup {
  readonly navigation: FormNavigation
  constructor(readonly certName: string, readonly form: FormGroup, readonly configuration: CertConfig) {
    cfgProcessor(form, configuration)
    this.navigation = new FormNavigation(this)
  }
  subform(name: string) {
    return this.form.get(name) as FormGroup
  }

  getConfig(name: string) {
    return this.configuration.steps[name]
  }
}