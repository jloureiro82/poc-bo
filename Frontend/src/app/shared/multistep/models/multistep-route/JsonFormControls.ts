import { JsonFormValidators } from "./JsonFormValidators";
import { Option } from "./Option";

export interface JsonFormControls {
  name: string;
  label: string;
  value: string;
  type: string;
  options ? : Option[];
  required: boolean;
  validators: JsonFormValidators;
}
