import { Component, Input, ViewChild } from '@angular/core';
import { FormStepDirective } from '../directives/form-step.directive';

@Component({
  selector: 'app-step2',
  templateUrl: './step2.component.html',
  styleUrls: ['./step2.component.css']
})
export class Step2Component {
  genders = [
    {id: 'male', name: 'Male'},
    {id: 'female', name: 'Female'},
    {id: 'other', name: 'Other'}
  ]

  languages = [
    {id: 'english', name: 'English'},
    {id: 'france', name: 'France'},
    {id: 'vietnamese', name: 'Vietnamese'},
  ]

  constructor(public formStep: FormStepDirective) { }
}
