import { ValidatorFn } from "@angular/forms";
interface CertTypesConfig {
    [key: string]: CertConfig
}

interface CertConfig {
    sequence: string[],
    steps: {
        [key: string]: StepConfig
    }
}

interface FieldConfig {
    default?: any
    validations: ValidatorFn[],
    options?: string[]
}

export interface StepConfig {
    name: string,
    validations: ValidatorFn[],
    fields: { [key: string]: FieldConfig }
  }