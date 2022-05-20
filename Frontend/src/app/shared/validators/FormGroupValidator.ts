
import { Validators } from "@angular/forms";
import { JsonFormControls } from "../multistep/models/multistep-route/JsonFormControls";

export class FormGroupValidator {
    static validationForm(control: JsonFormControls) {
        console.log('validationForm: ',control);
        const validatorsToAdd = [];
        for (const [key, value] of Object.entries(control.validators)) {
            if(value === 'unknown' ){
                switch (key) {
                  case 'min':
                    validatorsToAdd.push(Validators.min(value));
                    break;
                  case 'max':
                    validatorsToAdd.push(Validators.max(value));
                    break;
                  case 'required':
                    if (value) {
                      validatorsToAdd.push(Validators.required);
                    }
                    break;
                  case 'requiredTrue':
                    if (value) {
                      validatorsToAdd.push(Validators.requiredTrue);
                    }
                    break;
                  case 'email':
                    if (value) {
                      validatorsToAdd.push(Validators.email);
                    }
                    break;
                  case 'minLength':
                    validatorsToAdd.push(Validators.minLength(value));
                    break;
                  case 'maxLength':
                    validatorsToAdd.push(Validators.maxLength(value));
                    break;
                  case 'pattern':
                    validatorsToAdd.push(Validators.pattern(value));
                    break;
                  case 'nullValidator':
                    if (value) {
                      validatorsToAdd.push(Validators.nullValidator);
                    }
                    break;
                  default:
                    break;
                }
            }
        }
        return validatorsToAdd;
      }
}

function Types(unknown: any): any {
    throw new Error("Function not implemented.");
}
