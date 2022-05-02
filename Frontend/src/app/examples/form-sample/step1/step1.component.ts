import { Component } from '@angular/core';
import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-step1',
  templateUrl: './step1.component.html',
  styleUrls: ['./step1.component.css']
})
export class Step1Component {
  constructor(public formStep: FormStepDirective) {
    formStep.addValidation('name', (control: AbstractControl): ValidationErrors | null => {
      const forbidden = control.value === 'forbidden';
      return forbidden ? {forbiddenName: {value: control.value}} : null;
    })
   }
}
