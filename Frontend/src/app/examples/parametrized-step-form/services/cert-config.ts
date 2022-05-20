import { ValidatorFn, Validators } from "@angular/forms";
import { CertTypesConfig } from "../types";

const stepValidation: ValidatorFn = control => {
  const isCardIncluded = control.get('cardIncluded')?.value
  const cardField = control.get('cardField')
  console.log('validating full form', control.value)
  if (!isCardIncluded || cardField?.value) {
    return null
  }
  return { cardRequired: 'if card is included then cardField must be filled' }
}

export const certTypesConfig: CertTypesConfig = {
  'type A': {
    sequence: ['contact', 'customization', 'payment'],
    steps: {
      contact: {
        name: 'contact',
        validations: [stepValidation],
        fields: {
          fieldA: {validations: [Validators.required]},
          fieldB: {validations: []},
          fieldC: {validations: []},
          reqFieldA: {validations: []},
          reqFieldB: {validations: []},
          reqFieldC: {validations: []},
          optionField: {validations: [], options: ['1 ano', '2 anos']},
          cardIncluded: {default: true, validations: []},
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
      },
      finalization: {
        name: 'finalization',
        validations: [],
        fields: {}
      }
    }
  }
}