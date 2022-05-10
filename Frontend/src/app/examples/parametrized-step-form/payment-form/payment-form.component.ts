import { Component, OnInit } from '@angular/core';
import { FormConfig, FormStepDirective } from '../directives/form-step.directive';

const OPTIONAL_FIELDS: FormConfig = {
  fieldA: [],
  fieldB: [],
  fieldC: []
}

const REQUIRED_FIELDS: FormConfig = {
  reqFieldA: [],
  reqFieldB: [],
  reqFieldC: []
}

@Component({
  selector: 'app-payment-form',
  templateUrl: './payment-form.component.html',
  styleUrls: ['./payment-form.component.css']
})
export class PaymentFormComponent implements OnInit {

  constructor(private form: FormStepDirective) { }

  ngOnInit(): void {
    console.log('testeteste')
    this.form.formSetup(REQUIRED_FIELDS, OPTIONAL_FIELDS)
    console.log('oninit', this.form)
  }

  showField(name: string) {
    const field = this.form.getField(name)
    return !!field
  }
  getField(name: string) {
    return this.form.getField(name)
  }
}