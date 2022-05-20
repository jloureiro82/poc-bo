import { JsonFormControlOptions } from "./JsonFormControlOptions";
import { JsonFormValidators } from "./JsonFormValidators";

export interface JsonFormControls {
    name: string;
    label: string;
    value: string;
    type: string;
    options?: JsonFormControlOptions;
    required: boolean;
    validators: JsonFormValidators;
  }